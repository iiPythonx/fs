// Copyright (c) 2024 iiPython

// Encryption
if (!localStorage.getItem("encryption_enabled")) localStorage.setItem("encryption_enabled", "0");

// Assistant methods
function convert_size(bytes) {
    if (Math.abs(bytes) < 1024) return `${bytes} B`;
    let u = -1;
    do { bytes /= 1024; ++u; } while (Math.round(Math.abs(bytes) * 10) / 10 >= 1024 && u < 3 - 1);
    return `${bytes.toFixed(1)} ${["kB", "MB", "GB"][u]}`;
}

// Command handling
const commands = {
    send: () => {
        elements.line.style.display = "none";

        // Handle file input
        const file_input = document.createElement("input");
        file_input.type = "file";
        file_input.addEventListener("change", async (e) => {
            elements.line.style.display = "block";

            // Show file information
            const file = e.target.files[0];
            write_line(`${file.name}, ${file.type || 'unknown format'}, ${convert_size(file.size)}`);
            if (file.size > 5242880000) return write_line("File is too large, max size is 5 GB.", "r");

            // Handle file uploading
            if (!(await confirm("Confirm upload"))) return;
            if (+localStorage.getItem("encryption_enabled") && await confirm("Encrypt this file", "n")) {
                await upload_file(file, await input("Encryption password:", false));
            } else {
                await upload_file(file);
            }
            file_input.remove();
        });
        file_input.addEventListener("cancel", () => {
            write_line("File selection was canceled.", "r");
            elements.line.style.display = "block";
            file_input.remove();
        });
        file_input.click();
    },
    recv: async (file_id) => {
        file_id = file_id || await input("File ID (or paste link):")
        if (file_id.includes("http")) file_id = file_id.split("/")[4];
        const file = await (await fetch(`/api/find/${file_id}`)).json();
        if (file.code === 404) return write_line("Invalid File ID.", "r");

        // Show file information
        const chunk_size = calculate_chunk_size(file.size);
        write_line(`${file.file}${file.iv ? ', encrypted' : ''}, ${convert_size(file.size)}, ${convert_size(chunk_size)} chunks`);

        // Handle downloading
        await download_file(
            `${file_id}/${file.file}`,
            file.size,
            chunk_size,
            file.iv,
            file.salt,
            file.iv ? await input("Password:", false) : null
        );
    },
    delete: async (access_token) => {
        access_token = access_token || await input("Access token:");
        const result = await (await fetch(`/api/delete/${access_token}`, { method: "DELETE" })).json();
        if (result.code === 403) return write_line("Invalid access token.", "r");
        write_line(`File with ID ${result.id} was deleted.`);
    },
    encryption: async (new_value) => {
        new_value = new_value || await confirm("Enable encryption (beta)", "n");
        if (+new_value !== +localStorage.getItem("encryption_enabled")) {
            localStorage.setItem("encryption_enabled", +new_value + "");
            return write_line(`Encryption setting updated to <span class = "c${new_value ? 'g' : 'r'}">${new_value.toString().toUpperCase()}</span>.`);
        }
        return write_line("Encryption setting unchanged.");
    }
}

function run_command(command) {
    if (options.echo) write_line(`${elements.prompt.innerText} ${command}`);
    elements.command.innerText = "";

    // Handle callbacks
    if (options.call) { 
        options.call(command);
        elements.prompt.innerText = "%";
        options.call = null;
        return;
    }
    if (!command.length) return;

    // Run command
    const args = command.split(" ");
    if (!commands[args[0]]) return write_line(`${args[0]}: command not found`, "r");
    commands[args[0]](...args.slice(1));
}

document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || elements.line.style.display === "none") return;
    if (e.key === "Enter") run_command(elements.command.innerText);
    if (e.key === "Backspace") elements.command.innerText = elements.command.innerText.slice(0, -1);
    if (e.key.length === 1 && elements.command.innerText.length < 148) elements.command.innerText += e.key;
});
document.addEventListener("paste", (e) => {
    const text = (e.clipboardData || window.clipboardData).getData("Text");
    if (!text.length || elements.line.style.display === "none" || elements.command.innerText.length >= 148) return;
    elements.command.innerText += text;
});

// Handle click to use commands
for (const command_element of document.querySelectorAll("span.cg")) {
    command_element.style.cursor = "pointer";
    command_element.addEventListener("click", () => elements.command.innerText = command_element.innerText);
}

// Handle uploading
const megabyte = 1024 ** 2;
function calculate_chunk_size(file_size) {
    const size_in_mb = file_size / megabyte;
    if (size_in_mb >= 500) return 100 * megabyte;
    if (size_in_mb >= 250) return 50  * megabyte;
    if (size_in_mb >= 100) return 20  * megabyte;
    return 5 * megabyte;
}
async function upload_file(file, password) {

    // Handle encryption
    let encrypt = (d) => d, iv = crypto.getRandomValues(new Uint8Array(12)), salt = crypto.getRandomValues(new Uint8Array(16));
    if (password) encrypt = await generate_encryption_stream("encrypt", salt, iv, password);

    // Hide input line while uploading
    elements.line.style.display = "none";

    // Create progress bar
    write_line(`<span id = "progress">[${" ".repeat(44)}]</span>`);
    const progress = document.getElementById("progress");
    const chunk_size = calculate_chunk_size(file.size);

    // Handle encryption parameters
    const p = password ? `&header=${iv.join()}.${salt.join()}` : "";

    // Start file upload
    let total_sent = 0, error = false;
    const total_chunks = Math.ceil(file.size / chunk_size);
    const file_id = (await (await fetch(`/api/upload/start?filename=${file.name}${p}`, { method: "POST" })).json()).id;
    for (let start = 0; start < file.size; start += chunk_size) {
        if (error) break;

        // Encryption based uploading
        await new Promise((resolve) => {
            const reader = new FileReader();
            reader.addEventListener("load", async (e) => {
                const form_data = new FormData();
                form_data.append("file", new Blob([await encrypt(e.target.result)]));
                const xhr = new XMLHttpRequest();
                xhr.upload.addEventListener("progress", e => {
                    const ratio = (e.loaded / e.total);
                    if (ratio === 1) total_sent++;

                    // Handle progress bar
                    const blocks = "#".repeat(Math.floor((total_sent / total_chunks) * 44));
                    progress.innerHTML = `[${blocks}${"&nbsp;".repeat(44 - blocks.length)}] ${Math.round((total_sent / total_chunks) * 100)}%`;
                });
                xhr.addEventListener("load", () => resolve());
                xhr.addEventListener("error", () => reject());
                xhr.addEventListener("abort", () => reject());
                xhr.addEventListener("loadend", (e) => {
                    if (e.target.status === 200) return;
                    error = JSON.parse(e.target.response).message;
                });
                xhr.open("POST", `/api/upload/${file_id}`, true);
                xhr.send(form_data);
            });
            reader.readAsArrayBuffer(file.slice(start, start + chunk_size));
        });
    }
    progress.remove();
    elements.line.style.display = "block";
    if (error) return write_line(`Upload Error: ${error}`, "r");

    // Show results
    const result = await (await fetch(`/api/upload/${file_id}/finalize`, { method: "POST" })).json();
    const link = `${location.origin}/d/${result.file}`;
    write_line(`<br>File link: <a href = "${link}" target = "_blank">${link}</a><br>Access token: <span data-token = "${result.token}" class = "reveal" id = "reveal-${file_id}">(click to reveal)</span>`);

    // Handle click to reveal
    const element = document.getElementById(`reveal-${file_id}`);
    const handle_reveal = (e) => {
        element.innerText = element.getAttribute("data-token");
        element.classList.remove("reveal");
        element.removeEventListener("click", handle_reveal);
    };
    element.addEventListener("click", handle_reveal);
}

async function download_file(file, size, chunk_size, iv, salt, password) {

    // Handle decryption
    let decrypt = (d) => d;
    if (iv) {
        salt = new Uint8Array(salt.split(",").map(_ => Number(_))), iv = new Uint8Array(iv.split(",").map(_ => Number(_)));
        
        const _decrypt = await generate_encryption_stream("decrypt", salt, iv, password);
        decrypt = (d) => new Promise((resolve, reject) => {
            _decrypt(d).then((data) => resolve(data)).catch(() => {
                write_line("Invalid decryption password was entered.", "r");
                console.error("The decryption failed, so fuck you in particular I guess.");
                cleanup(false);
                reject("¯\\_(ツ)_/¯");
            });
        });
        chunk_size += 16;  // Handle AES overhead
    }

    // Hide input line while downloading
    elements.line.style.display = "none";

    // Create file stream
    const file_stream = streamSaver.createWriteStream(file.split("/").at(-1));
    const writer = file_stream.getWriter();

    window.addEventListener("unload", () => writer.abort());

    // Handle progress bar
    write_line(`<span id = "progress">[${" ".repeat(44)}]</span>`);
    const progress = document.getElementById("progress");

    let downloaded = 0;
    const update_progress = () => {
        const blocks = "#".repeat(Math.floor((downloaded / size) * 44));
        progress.innerHTML = `[${blocks}${"&nbsp;".repeat(44 - blocks.length)}] ${Math.round((downloaded / size) * 100)}%`;
    }

    // Start file download
    const cleanup = (write = true) => {
        update_progress();
        if (write) writer.close();
        progress.remove();
        elements.line.style.display = "block";
    }

    const reader = (await fetch(`/d/${file}`)).body.getReader();
    const append_buffer = (b1, b2) => {
        let tmp = new Uint8Array(b1.byteLength + b2.byteLength);
        tmp.set(new Uint8Array(b1), 0);
        tmp.set(new Uint8Array(b2), b1.byteLength);
        return tmp.buffer;
    };
    let current_chunk = new ArrayBuffer(0), errored = false;
    const stream = new ReadableStream({
        start(controller) {
            function push() {
                reader.read().then(async ({ done, value }) => {
                    if (done) {
                        if (current_chunk.byteLength > 0) {
                            writer.write(new Uint8Array(await decrypt(current_chunk)))
                                .then(() => { downloaded += current_chunk.byteLength; cleanup(); })
                                .catch(() => { if (!errored) write_line("How dare you just cancel my file prompt?", "r"); });
                            return;
                        }
                        return cleanup();
                    }

                    // Add to current chunk
                    current_chunk = append_buffer(current_chunk, value.buffer);
                    if (current_chunk.byteLength > chunk_size) {
                        writer.write(new Uint8Array(await decrypt(current_chunk.slice(0, chunk_size)))).catch(() => {
                            if (errored) return;
                            write_line("How dare you just cancel my file prompt?", "r")
                            errored = true;
                        });
                        current_chunk = current_chunk.slice(chunk_size);
                        downloaded += chunk_size;
                    }
                    update_progress();
                    push();
                });
            }
            push();
        },
    });
    new Response(stream);
}
