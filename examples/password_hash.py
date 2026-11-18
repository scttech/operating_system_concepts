"""Storing passwords: why a plain hash is not enough, what a salt adds, and what repeating the hash costs an attacker."""
import hashlib
import hmac

PASSWORD = "correct horse"
ALICE_SALT, BOB_SALT = "a1b2c3d4", "9f8e7d6c"
ROUNDS = 10000


def sha(data):
    return hashlib.sha256(data).digest()


def plain(password):
    return sha(password.encode())


def salted(salt, password):
    return sha(salt.encode() + password.encode())


def stretched(salt, password, rounds):
    h = salted(salt, password)
    for _ in range(rounds - 1):
        h = sha(h + password.encode())                   # (3) repeating makes each guess cost many hashes, for the attacker and for us
    return h


def show(label, digest):
    print(f"{label:<24}{digest.hex()[:16]}...")


show('sha256 of "password":', plain("password"))
show("alice, no salt:", plain(PASSWORD))
show("bob, no salt:", plain(PASSWORD))
print(f"same password, same stored hash: {plain(PASSWORD) == plain(PASSWORD)}")                                     # (1) without a salt, equal passwords give equal hashes
show("alice, salted:", salted(ALICE_SALT, PASSWORD))
show("bob, salted:", salted(BOB_SALT, PASSWORD))
print(f"same password, same stored hash: {salted(ALICE_SALT, PASSWORD) == salted(BOB_SALT, PASSWORD)}")            # (2) a salt makes every record unique, so a table of precomputed hashes is useless
stored = stretched(ALICE_SALT, PASSWORD, ROUNDS)
show(f"alice, salted, x{ROUNDS}:", stored)
for guess in (PASSWORD, "correct horsf"):
    ok = hmac.compare_digest(stretched(ALICE_SALT, guess, ROUNDS), stored)                                         # (4) compare in constant time so the comparison itself leaks nothing
    print(f'check "{guess}": {ok}')
