#!/usr/bin/env python3
"""
Put a password on the IDE's updater signing key, WITHOUT changing the key.

Security review, 25 Nov 2026: src-tauri/.tauri-updater-key had an empty
password, so anyone who copied that one file could sign an "update" every
installed IDE would accept. The public half is compiled into every installed
copy, so a NEW key would strand them all; this re-encrypts the SAME key.

The key is a standard minisign secret key (scrypt + XOR, BLAKE2b checksum),
base64-wrapped by Tauri. This script:
  1. decrypts it with the current password (Enter if none) and checks the
     built-in checksum;
  2. asks for the new password twice;
  3. stores the new password in the Windows keychain
     (scripts/secret.mjs, name TAURI_SIGNING_PRIVATE_KEY_PASSWORD) and reads it back;
  4. only then writes the re-encrypted key over the old file, after proving
     the new file decrypts to the same key.
Nothing secret is ever printed.

  python packages/ide/scripts/updater-key-password.py          set / change it
  python packages/ide/scripts/updater-key-password.py --check  keychain password opens the key?
"""
import base64, getpass, hashlib, os, secrets, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
KEY = os.path.join(HERE, '..', 'src-tauri', '.tauri-updater-key')
SECRET_JS = os.path.join(HERE, '..', '..', '..', 'scripts', 'secret.mjs')
NAME = 'TAURI_SIGNING_PRIVATE_KEY_PASSWORD'


def kdf_params(ops, mem):
    """libsodium's pickparams for crypto_pwhash_scryptsalsa208sha256."""
    ops = max(ops, 32768)
    r = 8
    if ops < mem // 32:
        p, max_n = 1, ops // (r * 4)
    else:
        max_n = mem // (r * 128)
    n_log2 = next(i for i in range(1, 63) if (1 << i) > max_n // 2)
    if ops >= mem // 32:
        p = min((ops // 4) // (1 << n_log2), 0x3FFFFFFF) // r
    return 1 << n_log2, r, p


def stream(password, salt, ops, mem):
    n, r, p = kdf_params(ops, mem)
    return hashlib.scrypt(password, salt=salt, n=n, r=r, p=p, maxmem=2 * 128 * r * n + 1024 * 1024, dklen=104)


def load():
    lines = base64.b64decode(open(KEY).read().strip()).decode().splitlines()
    return lines[0], base64.b64decode(lines[1])


def open_key(blob, password):
    """(keyid, sk) if the password is right, else None."""
    if blob[0:6] != b'EdScB2':
        sys.exit('Unexpected key format; nothing changed.')
    salt, ops, mem = blob[6:38], int.from_bytes(blob[38:46], 'little'), int.from_bytes(blob[46:54], 'little')
    dec = bytes(a ^ b for a, b in zip(blob[54:158], stream(password, salt, ops, mem)))
    keyid, sk, chk = dec[:8], dec[8:72], dec[72:104]
    return (keyid, sk) if hashlib.blake2b(b'Ed' + keyid + sk, digest_size=32).digest() == chk else None


def seal(keyid, sk, password, ops, mem):
    salt = secrets.token_bytes(32)
    chk = hashlib.blake2b(b'Ed' + keyid + sk, digest_size=32).digest()
    enc = bytes(a ^ b for a, b in zip(keyid + sk + chk, stream(password, salt, ops, mem)))
    return b'EdScB2' + salt + ops.to_bytes(8, 'little') + mem.to_bytes(8, 'little') + enc


def keychain(*args, stdin=None):
    return subprocess.run(['node', SECRET_JS, *args], input=stdin, capture_output=True, text=True)


def main():
    comment, blob = load()
    ops, mem = int.from_bytes(blob[38:46], 'little'), int.from_bytes(blob[46:54], 'little')

    if '--check' in sys.argv:
        got = keychain('get', NAME)
        ok = got.returncode == 0 and open_key(blob, got.stdout.encode()) is not None
        print('The keychain password opens the updater key.' if ok else 'The keychain password does NOT open the updater key.')
        sys.exit(0 if ok else 1)

    if open_key(blob, b'') is not None:
        opened = open_key(blob, b'')
        print('The key has no password yet.')
    else:
        opened = open_key(blob, getpass.getpass('Current password: ').encode())
        if opened is None:
            sys.exit('That is not the current password. Nothing changed.')

    pw = getpass.getpass('New password (12+ characters, typing is hidden): ')
    if len(pw) < 12:
        sys.exit('Too short (needs 12+). Nothing changed.')
    if getpass.getpass('Same password again: ') != pw:
        sys.exit('The two did not match. Nothing changed.')

    new_blob = seal(*opened, pw.encode(), ops, mem)
    if open_key(new_blob, pw.encode()) != opened:
        sys.exit('Re-encryption did not verify. Nothing changed.')

    saved = keychain('set', NAME, stdin=pw)
    if saved.returncode != 0:
        sys.exit('Could not store the password in the keychain (' + saved.stderr.strip() + '). Nothing changed.')

    tmp = KEY + '.new'
    with open(tmp, 'w', newline='') as f:
        f.write(base64.b64encode((comment + '\n' + base64.b64encode(new_blob).decode() + '\n').encode()).decode())
    if open_key(load_from(tmp), pw.encode()) != opened:
        os.remove(tmp)
        sys.exit('The new file did not verify. Old key left in place.')
    os.replace(tmp, KEY)
    print('Done. Same key, now password-protected; the password is in the Windows keychain.')
    print('Now save BOTH in your password manager: the password, and a copy of')
    print('packages/ide/src-tauri/.tauri-updater-key. Without them, no IDE update can ever be signed again.')


def load_from(path):
    lines = base64.b64decode(open(path).read().strip()).decode().splitlines()
    return base64.b64decode(lines[1])


if __name__ == '__main__':
    main()
