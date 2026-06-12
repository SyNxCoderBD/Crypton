/**
 * Utility functions for AES-GCM encryption and decryption using Web Crypto API.
 */

const ITERATIONS = 100000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * Derives a cryptographic key from a password and salt.
 */
async function deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: ITERATIONS,
            hash: 'SHA-256'
        },
        passwordKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypts data (string or Uint8Array) using a password.
 * Returns a Base64 string containing salt + iv + ciphertext.
 */
export async function encrypt(data, password) {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    
    const key = await deriveKey(password, salt);
    
    let encodedData;
    if (data instanceof Uint8Array) {
        encodedData = data;
    } else {
        encodedData = new TextEncoder().encode(data);
    }

    const encryptedContent = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encodedData
    );

    const encryptedContentArr = new Uint8Array(encryptedContent);
    const result = new Uint8Array(salt.length + iv.length + encryptedContentArr.length);
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(encryptedContentArr, salt.length + iv.length);

    // Efficiently convert Uint8Array to Base64 using chunks to avoid stack limits
    const chunks = [];
    const chunk = 16384;
    for (let i = 0; i < result.length; i += chunk) {
        chunks.push(String.fromCharCode.apply(null, result.subarray(i, i + chunk)));
    }
    return btoa(chunks.join(''));
}

/**
 * Decrypts a Base64 string using a password.
 * Returns the decrypted content as a Uint8Array.
 */
export async function decrypt(base64Data, password) {
    try {
        const cleanedData = base64Data.replace(/[^A-Za-z0-9+/=]/g, '');
        const binaryString = atob(cleanedData);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const salt = bytes.slice(0, SALT_LENGTH);
        const iv = bytes.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const ciphertext = bytes.slice(SALT_LENGTH + IV_LENGTH);

        if (ciphertext.length === 0) throw new Error('Data is too short');

        const key = await deriveKey(password, salt);
        const decryptedContent = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );

        return new Uint8Array(decryptedContent);
    } catch (e) {
        console.error('Decryption internal error:', e);
        throw new Error('Decryption failed. Invalid key or corrupted data.');
    }
}