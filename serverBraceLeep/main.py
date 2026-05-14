from flask import Flask, request, jsonify, g
import mysql.connector
import bcrypt
import re
from flask_cors import CORS
import os
import time
import jwt
import datetime as dt

app = Flask(__name__)

# ================= JWT =================
JWT_SECRET = "831010ba9bd447d1502a480b6f78b8183c4112e2b45314d1e978cb7629aa19b3"
JWT_ALGORITHM = "HS256"

CORS(app, supports_credentials=True, origins="*")

# ================= DATABASE =================

def get_db():
    while True:
        try:
            conn = mysql.connector.connect(
                host=os.getenv("DB_HOST"),
                user=os.getenv("DB_USER"),
                password=os.getenv("DB_PASSWORD"),
                database=os.getenv("DB_NAME")
            )
            print("✅ Connesso al DB:", conn.database)
            return conn
        except Exception as e:
            print(f"❌ DB non pronto, retry... ({e})")
            time.sleep(2)


def get_conn():
    if "db" not in g:
        g.db = get_db()

    try:
        g.db.ping(reconnect=True, attempts=3, delay=2)
    except:
        g.db = get_db()

    return g.db


@app.teardown_appcontext
def close_db(error):
    db = g.pop("db", None)
    if db is not None:
        try:
            db.close()
        except:
            pass

# ================= JWT HELPERS =================

def create_token(email):
    payload = {
        "email": email,
        "exp": dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=1)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_email(req):
    auth = req.headers.get("Authorization")
    if not auth:
        return None

    try:
        token = auth.replace("Bearer ", "")
        decoded = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return decoded["email"]
    except:
        return None

# ================= LOGIN =================

@app.route("/login", methods=["POST"])
def login():
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify(success=False, message="JSON non valido"), 400

        email = data.get("email")
        password = data.get("password")

        db = get_conn()
        cur = db.cursor(dictionary=True)

        cur.execute("SELECT * FROM utenti WHERE email = %s", (email,))
        user = cur.fetchone()

        if not user:
            return jsonify(success=False, message="Credenziali non valide")

        hash_db = re.sub(r"[\r\n]", "", user["password"])

        if not bcrypt.checkpw(password.encode(), hash_db.encode()):
            return jsonify(success=False, message="Credenziali non valide")

        token = create_token(email)

        return jsonify(success=True, token=token)

    except Exception as e:
        print("ERRORE LOGIN:", e)
        return jsonify(success=False, error=str(e)), 500

# ================= REGISTER =================

@app.route("/register", methods=["POST"])
def register():
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify(success=False, message="JSON non valido"), 400

        nome = data.get("nome", "").strip()
        cognome = data.get("cognome", "").strip()
        email = data.get("email", "").strip()
        password = data.get("password")

        if not nome or not cognome or not email or not password:
            return jsonify(success=False, message="Compila tutti i campi")

        db = get_conn()
        cur = db.cursor(dictionary=True)

        cur.execute("SELECT id FROM utenti WHERE email = %s", (email,))
        if cur.fetchone():
            return jsonify(success=False, message="Email già registrata")

        hashed_pw = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

        cur.execute(
            "INSERT INTO utenti (nome, cognome, email, password) VALUES (%s, %s, %s, %s)",
            (nome, cognome, email, hashed_pw)
        )

        db.commit()

        return jsonify(success=True, message="Registrazione completata")

    except Exception as e:
        print("ERRORE REGISTER:", e)
        return jsonify(success=False, error=str(e)), 500

# ================= CHANGE PASSWORD =================

@app.route("/change-password", methods=["POST"])
def change_password():
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify(success=False, message="JSON non valido"), 400

        email = get_email(request)
        if not email:
            return jsonify(success=False, message="Non autorizzato"), 401

        old_pw = data.get("oldPw")
        new_pw = data.get("newPw")

        db = get_conn()
        cur = db.cursor(dictionary=True)

        cur.execute("SELECT password FROM utenti WHERE email = %s", (email,))
        user = cur.fetchone()

        if not user:
            return jsonify(success=False, message="Utente non trovato")

        if not bcrypt.checkpw(old_pw.encode(), user["password"].encode()):
            return jsonify(success=False, message="Password errata")

        new_hash = bcrypt.hashpw(new_pw.encode(), bcrypt.gensalt()).decode()

        cur.execute(
            "UPDATE utenti SET password = %s WHERE email = %s",
            (new_hash, email)
        )

        db.commit()

        return jsonify(success=True, message="Password aggiornata")

    except Exception as e:
        print("ERRORE CHANGE PASSWORD:", e)
        return jsonify(success=False, error=str(e)), 500

# ================= CHANGE PROFILE =================

@app.route("/changeProfile", methods=["POST"])
def change_profile():
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify(success=False, message="JSON non valido"), 400

        email = get_email(request)
        if not email:
            return jsonify(success=False, message="Non autorizzato"), 401

        nomeCompleto = data.get("nome_completo")
        if not nomeCompleto:
            return jsonify(success=False, message="Nome mancante")

        parti = nomeCompleto.split()
        nome = parti[0]
        cognome = " ".join(parti[1:]) if len(parti) > 1 else ""

        db = get_conn()
        cur = db.cursor()

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
        """, (
            nome,
            cognome,
            data.get("eta"),
            data.get("genere"),
            data.get("peso"),
            data.get("altezza"),
            data.get("obiettivo_sonno"),
            data.get("livello_attivita"),
            data.get("problemi_sonno"),
            email
        ))

        db.commit()

        return jsonify(success=True, message="Profilo aggiornato")

    except Exception as e:
        print("ERRORE CHANGE PROFILE:", e)
        return jsonify(success=False, error=str(e)), 500

# ================= CARICA PROFILO =================

@app.route("/caricaProfilo", methods=["POST"])
def carica_profile():
    try:
        email = get_email(request)
        if not email:
            return jsonify(success=False, message="Non autorizzato"), 401

        db = get_conn()
        cur = db.cursor(dictionary=True)

        cur.execute("SELECT * FROM utenti WHERE email = %s", (email,))
        user = cur.fetchone()

        if not user:
            return jsonify(success=False, message="Utente non trovato")

        return jsonify(success=True, profile={
            "nome_completo": f"{user['nome']} {user['cognome']}",
            "eta": user.get("eta"),
            "genere": user.get("genere"),
            "peso": user.get("peso"),
            "altezza": user.get("altezza"),
            "obiettivo_sonno": user.get("obbiettivo_sonno"),
            "livello_attivita": user.get("livello_attivita"),
            "problemi_sonno": user.get("prob_sonno")
        })

    except Exception as e:
        print("ERRORE CARICA PROFILO:", e)
        return jsonify(success=False, error=str(e)), 500

# ================= DELETE ACCOUNT =================

@app.route("/clearAllData", methods=["GET"])
def clear_all():
    try:
        email = get_email(request)
        if not email:
            return jsonify(success=False, message="Non autorizzato"), 401

        db = get_conn()
        cur = db.cursor()

        cur.execute("DELETE FROM utenti WHERE email = %s", (email,))
        db.commit()

        return jsonify(success=True, message="Account eliminato")

    except Exception as e:
        print("ERRORE CLEAR DATA:", e)
        return jsonify(success=False, error=str(e)), 500

# ================= LOGOUT =================

@app.route("/logout", methods=["GET"])
def logout():
    return jsonify(success=True, message="Logout lato client")

# ================= BR =================

@app.route("/mandaBR", methods=["POST"])
def manda_br():
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify(success=False, message="JSON non valido"), 400

        email = get_email(request)
        if not email:
            return jsonify(success=False, message="Non autorizzato"), 401

        b = data.get("b")
        r = data.get("r")

        if b is None or r is None:
            return jsonify(success=False, message="Dati mancanti"), 400

        db = get_conn()
        cur = db.cursor()

        cur.execute("SELECT id FROM utenti WHERE email = %s", (email,))
        utente = cur.fetchone()

        if not utente:
            return jsonify(success=False, message="Utente non trovato"), 404

        id_utente = utente[0]

        now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)

        cur.execute("""
            INSERT INTO dati_braccialetto
            (b, r, data_esatta, idUtente_datoBraccialetto)
            VALUES (%s, %s, %s, %s)
        """, (b, r, now, id_utente))

        db.commit()

        return jsonify(success=True, message="BR salvato")

    except Exception as e:
        print("ERRORE MANDA BR:", e)
        return jsonify(success=False, message="Errore server", error=str(e)), 500

# ================= CALCOLA SONNO =================

def calcola_da_messaggi(messaggi):
    if not messaggi:
        return None

    valori_r = [m[1] for m in messaggi]
    totale = len(valori_r)

    primo_sonno_idx = next((i for i, r in enumerate(valori_r) if r == 0), None)
    if primo_sonno_idx is None:
        return None

    n_dormiti = sum(1 for r in valori_r if r == 0)
    n_svegli_dopo = sum(1 for r in valori_r[primo_sonno_idx:] if r == 1)

    tst_min = n_dormiti * 10
    waso_min = n_svegli_dopo * 10

    n_risvegli = sum(
        1 for i in range(primo_sonno_idx + 1, totale)
        if valori_r[i] == 1 and valori_r[i - 1] == 0
    )

    daw = round(waso_min / n_risvegli, 2) if n_risvegli > 0 else 0
    tempo_totale = tst_min + waso_min
    se_efficienza = round((tst_min / tempo_totale * 100), 2) if tempo_totale > 0 else 0
    mi = round(sum(1 for r in valori_r if r == 1) / totale * 100, 2)

    return {
        "tst": round(tst_min / 60, 2),
        "waso": round(waso_min / 60, 2),
        "se_efficienza": se_efficienza,
        "se_tempo_dormita": round(tst_min / 60, 2),
        "nRisvegli": n_risvegli,
        "daw": daw,
        "mi": mi,
        "ai": 0,
    }

# ================= CALCOLA SONNO ROUTE =================

@app.route("/calcolaSonno", methods=["POST"])
def calcola_sonno():
    try:
        email = get_email(request)
        if not email:
            return jsonify(success=False, message="Non autorizzato"), 401

        db = get_conn()
        cur = db.cursor()

        cur.execute("SELECT id FROM utenti WHERE email = %s", (email,))
        utente = cur.fetchone()

        if not utente:
            return jsonify(success=False, message="Utente non trovato"), 404

        id_utente = utente[0]

        da = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=24)
        da = da.replace(tzinfo=None)

        cur.execute("""
            SELECT b, r, data_esatta
            FROM dati_braccialetto
            WHERE idUtente_datoBraccialetto = %s
              AND data_esatta >= %s
            ORDER BY data_esatta ASC
        """, (id_utente, da))

        messaggi = cur.fetchall()

        if not messaggi:
            return jsonify(success=False, message="Nessun dato disponibile nelle ultime 24h"), 404

        dati = calcola_da_messaggi(messaggi)

        if not dati:
            return jsonify(success=False, message="Nessun sonno rilevato nei dati"), 422

        giorno_dormita = messaggi[-1][2].date()

        cur.execute("""
            DELETE FROM dati_sonno
            WHERE id_utente = %s AND giorno_dormita = %s
        """, (id_utente, giorno_dormita))

        cur.execute("""
            INSERT INTO dati_sonno
            (id_utente, tst, waso, se_efficienza, se_tempo_dormita,
             nRisvegli, daw, mi, ai, giorno_dormita)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """, (
            id_utente,
            dati["tst"],
            dati["waso"],
            dati["se_efficienza"],
            dati["se_tempo_dormita"],
            dati["nRisvegli"],
            dati["daw"],
            dati["mi"],
            dati["ai"],
            giorno_dormita
        ))

        db.commit()

        lunedi = giorno_dormita - dt.timedelta(days=giorno_dormita.weekday())
        giorni_it = ["Lun","Mar","Mer","Gio","Ven","Sab","Dom"]

        settimana = []

        for i in range(7):
            giorno = lunedi + dt.timedelta(days=i)

            cur.execute("""
                SELECT tst, waso, se_efficienza, nRisvegli, daw, mi, ai
                FROM dati_sonno
                WHERE id_utente = %s AND giorno_dormita = %s
            """, (id_utente, giorno))

            row = cur.fetchone()

            settimana.append({
                "giorno": giorni_it[i],
                "TST": row[0] if row else None,
                "WASO": row[1] if row else None,
                "SE": row[2] if row else None,
                "risvegli": row[3] if row else None,
                "DAW": row[4] if row else None,
                "MI": row[5] if row else None,
                "AI": row[6] if row else None,
            })

        return jsonify(success=True, message="Sonno calcolato e salvato", data=settimana)

    except Exception as e:
        print("ERRORE CALCOLA SONNO:", e)
        return jsonify(success=False, message="Errore server", error=str(e)), 500

# ================= START =================

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
