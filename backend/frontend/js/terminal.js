// Copyright (c) 2024 iiPython

// Initialization
const elements = {
    term:       document.getElementById("terminal"),
    prompt:     document.getElementById("prompt"),
    command:    document.getElementById("command"),
    line:       document.getElementById("line"),
    scroll:     document.scrollingElement || document.body,
}
const options = {
    echo: true,  // Enable line echoing
    call: null,  // Enable command callback
}

// Handle terminal
function write_line(line, color) {
    elements.term.insertAdjacentHTML("beforeend", `<p>${color ? `<span class = "c${color}">${line}</span>` : line}</p>`);
    elements.scroll.scrollTop = elements.scroll.scrollHeight;
}
function input(prompt, echo = true) {
    return new Promise((resolve) => {
        options.echo = echo || false;
        options.call = (a) => {
            resolve(a);
            options.echo = true;
        }
        elements.prompt.innerText = prompt;
    });
}
function confirm(prompt, fallback = "y") {
    const fallback_string = fallback === "y" ? "(Y/n)" : "(y/N)";
    return new Promise(async resolve => {
        return resolve(["yes", "y"].includes((await input(`${prompt} ${fallback_string}?`, false)) || fallback));
    });
}
