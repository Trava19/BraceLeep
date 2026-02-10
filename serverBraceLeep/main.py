from flask import Flask, request, jsonify, session
import mysql.connector
import bcrypt
import re

app = Flask(__name__)
app.secret_key ="831010ba9bd447d1502a480b6f78b8183c4112e2b45314d1e978cb7629aa19b3"

app.config.update(
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="None"
)


db = mysql.connector.connect(
    host="localhost",
    user="root",
    password="",
    database="braccialetto_sonno"
)

# ================= LOGIN =================
@app.route("/login", methods=["POST"])
def login():
    data = request.json
    email = data["email"]
    session["email"] = email
    password = data["password"]
    #print(email, password)
    
    cur = db.cursor(dictionary=True)
    cur.execute("SELECT * FROM utenti WHERE email = %s", (email,))
    user = cur.fetchone()

    #print("password:", password)
    #print("hash dal db:", repr(user["password"]))
    #print("tipo hash:", type(user["password"]))

    if not user:
        return jsonify(success=False, message="Credenziali non valide email")


    hash_db = re.sub(r"[\r\n]", "", user["password"])

    if not bcrypt.checkpw(password.encode(), hash_db.encode()):
        return jsonify(success=False, message="Credenziali non valide password")


    return jsonify(success=True, email=user["email"])




# ================= REGISTRAZIONE =================
@app.route("/register", methods=["POST"])
def register():
    data = request.json
    nome = data.get("nome", "").strip()
    cognome = data.get("cognome", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "").strip()

    # Controllo campi obbligatori
    if not nome or not cognome or not email or not password:
        return jsonify(success=False, message="Compila tutti i campi obbligatori")
    
    

    # Verifica se email già esistente
    cur = db.cursor(dictionary=True)
    cur.execute("SELECT id FROM utenti WHERE email = %s", (email,))
    existing = cur.fetchone()

    if existing:
        return jsonify(success=False, message="Email già registrata")

    # Hash della password
    hashed_pw = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

    # Inserimento utente con nome e cognome
    cur.execute(
        "INSERT INTO utenti (nome, cognome, email, password) VALUES (%s, %s, %s, %s)",
        (nome, cognome, email, hashed_pw)
    )
    db.commit()

    return jsonify(success=True, message="Registrazione completata")

    


# ================= CAMBIO PASSWORD =================
@app.route("/change-password", methods=["POST"])
def change_password():
    data = request.json or {}

    email = session.get("email")
    old_pw = data.get("oldPw")
    new_pw = data.get("newPw")

    if not email or not old_pw or not new_pw:
        return jsonify(success=False, message="Dati mancanti"), 400

    cur = db.cursor(dictionary=True)
    cur.execute("SELECT password FROM utenti WHERE email = %s", (email,))
    user = cur.fetchone()

    if not user:
        return jsonify(success=False, message="Utente non trovato")

    if not bcrypt.checkpw(old_pw.encode(), user["password"].encode()):
        return jsonify(success=False, message="Password attuale errata")

    new_hash = bcrypt.hashpw(new_pw.encode(), bcrypt.gensalt()).decode()

    cur.execute(
        "UPDATE utenti SET password = %s WHERE email = %s",
        (new_hash, email)
    )
    db.commit()

    return jsonify(success=True, message="Password aggiornata con successo")

# ================= MODIFICA PROFILO =================
@app.route("/changeProfile", methods=["POST"])
def change_profile():
    data = request.json or {}

    email = session.get("email")
    nomeCompleto = data.get("nome_completo")
    eta = data.get("eta")
    genere = data.get("genere")
    peso = data.get("peso")
    altezza = data.get("altezza")
    obbiettivo_sonno = data.get("obiettivo_sonno")
    livello_attivita = data.get("livello_attivita")
    problemi_sonno = data.get("problemi_sonno")

    if not email or not nomeCompleto:
        return jsonify(success=False, message="Dati mancanti")

    partiNome = nomeCompleto.strip().split()
    nome = partiNome[0]
    cognome = " ".join(partiNome[1:]) if len(partiNome) > 1 else ""

    cur = db.cursor(dictionary=True)
    cur.execute("SELECT id FROM utenti WHERE email = %s", (email,))
    if not cur.fetchone():
        return jsonify(success=False, message="Utente non trovato")

    cur.execute("""
        UPDATE utenti SET
            nome=%s,
            cognome=%s,
            eta=%s,
            genere=%s,
            peso=%s,
            altezza=%s,
            obbiettivo_sonno=%s,
            livello_attivita=%s,
            prob_sonno=%s
        WHERE email=%s
    """, (nome, cognome, eta, genere, peso, altezza,
          obbiettivo_sonno, livello_attivita, problemi_sonno, email))
    if cur.rowcount == 0:
        return jsonify(success=False, message="Nessun dato aggiornato")


    db.commit()
    return jsonify(success=True, message="Profilo aggiornato con successo")


# ================= CARICA PROFILO =================
@app.route("/caricaProfilo", methods=["POST"])
def carica_profile():
    data = request.json or {}



    email = session.get("email") 

    if not email:
        return jsonify(success=False, message="Dati mancanti")

    cur = db.cursor(dictionary=True)
    cur.execute("SELECT * FROM utenti WHERE email = %s", (email,))
    user = cur.fetchone()

    if not user:
        return jsonify(success=False, message="Utente non trovato")

    profile_data = {
        "nome_completo": f"{user['nome']} {user['cognome']}",
        "eta": user.get("eta"),
        "genere": user.get("genere"),
        "peso": user.get("peso"),
        "altezza": user.get("altezza"),
        "obiettivo_sonno": user.get("obbiettivo_sonno"),
        "livello_attivita": user.get("livello_attivita"),
        "problemi_sonno": user.get("prob_sonno")
    }

    return jsonify(success=True, profile=profile_data)

@app.route("/clearAllData", methods=["GET"])
def clearAllData():

    email = session.get("email")

    if not email:
        return jsonify(success=False, message="Dati mancanti")

    cur = db.cursor()
    cur.execute("DELETE FROM utenti WHERE email = %s", (email,))
    db.commit()

    return jsonify(success=True, message="Tutti i dati sono stati cancellati")


# ================= LOGOUT =================
@app.route("/logout", methods=["GET"])
def logout():
    session.clear()
    return jsonify(success=True, message="Logout effettuato")
         


if __name__ == "__main__":
    app.run(port=5000, debug=True, ssl_context='adhoc')