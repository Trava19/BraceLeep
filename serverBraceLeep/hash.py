import bcrypt

password = "l"
hashed_from_db = "$2b$12$1bemWnOpRugAiRAarjO4.ePQjzVbfMdHCOaqRWfLy9q293YBKWl36"

if bcrypt.checkpw(password.encode(), hashed_from_db.encode()):
    print("Password corretta!")
else:
    print("Password errata!")
