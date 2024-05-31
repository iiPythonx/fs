// Copyright (c) 2024 iiPython

async function generate_encryption_stream(type, salt, iv, password) {
    const key = await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256",
        },
        await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits", "deriveKey"]),
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"],
    );
    return (data) => crypto.subtle[type]({ name: "AES-GCM", iv }, key, data);
}
