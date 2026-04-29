#include <Arduino.h>
#include <Wire.h>
#include <bluefruit.h>
#include "MAX30105.h"
#include "heartRate.h"

MAX30105 particleSensor;
const byte RATE_SIZE = 4;
byte rates[RATE_SIZE];
byte rateSpot = 0;
long lastBeat = 0;
float beatsPerMinute = 0;
int beatAvg = 0;

#define MPU6050_ADDR    0x68
#define REG_PWR_MGMT_1  0x6B
#define REG_ACCEL_XOUT  0x3B
#define REG_ACCEL_CFG   0x1C
#define REG_GYRO_CFG    0x1B

#define DELAY_TIME         10
#define FINESTRA_MS        10000
#define SOGLIA_FLAG        FINESTRA_MS/1000
#define SOGLIA_NO_POLSO    (FINESTRA_MS / DELAY_TIME / 3)

int movimento_count        = 0;
int flag_in_frame          = 0;
int stato_risveglio        = 0;
int campioni_no_polso      = 0;
unsigned long ultimo_invio = 0;

BLEDis bledis;
BLEHidGeneric blehid(1, 0, 0);

#define SLEEP_SERVICE_UUID  "12345678-1234-1234-1234-123456789abc"
#define SLEEP_CHAR_UUID     "12345678-1234-1234-1234-123456789abd"

BLEService        sleepService(SLEEP_SERVICE_UUID);
BLECharacteristic sleepChar(SLEEP_CHAR_UUID);

static const uint8_t hid_report_descriptor[] = {
  0x06, 0x00, 0xFF,
  0x09, 0x01,
  0xA1, 0x01,
  0x09, 0x02,
  0x15, 0x00,
  0x25, 0xFF,
  0x75, 0x08,
  0x95, 0x01,
  0x81, 0x02,
  0xC0
};

void writeReg(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

void readBytes(uint8_t reg, uint8_t* buf, uint8_t len) {
  Wire.beginTransmission(MPU6050_ADDR);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU6050_ADDR, (int)len);
  for (uint8_t i = 0; i < len; i++) buf[i] = Wire.read();
}

int16_t toInt16(uint8_t hi, uint8_t lo) {
  return (int16_t)((hi << 8) | lo);
}

void connect_callback(uint16_t conn_handle) {
  BLEConnection* conn = Bluefruit.Connection(conn_handle);
  conn->requestPHY();
  conn->requestDataLengthUpdate();
  conn->requestConnectionParameter(160, 4, 600);
  Bluefruit.Advertising.stop();
}

void disconnect_callback(uint16_t conn_handle, uint8_t reason) {
  (void) conn_handle;
  (void) reason;
}

void invia_json() {
  bool polso_ok = (campioni_no_polso < SOGLIA_NO_POLSO);

  Serial.print("[INFO] Campioni senza polso: ");
  Serial.print(campioni_no_polso);
  Serial.print(" / soglia: ");
  Serial.println(SOGLIA_NO_POLSO);
  Serial.print("[INFO] Flag in finestra: ");
  Serial.print(flag_in_frame);
  Serial.print(" / soglia risveglio: ");
  Serial.println(SOGLIA_FLAG);
  Serial.print("[INFO] Stato risveglio finale: ");
  Serial.println(stato_risveglio);

  campioni_no_polso = 0;
  flag_in_frame     = 0;
  //stato_risveglio   = 0;

  if (!Bluefruit.connected()) {
    Serial.println("[BLE] Non connesso, skip invio");
    return;
  }

  if (!sleepChar.notifyEnabled()) {
    Serial.println("[BLE] Notify non abilitata, skip invio");
    return;
  }

  char json[32];
  if (polso_ok) {
    snprintf(json, sizeof(json), "{\"b\":%d,\"r\":%d}", beatAvg, stato_risveglio);
  } else {
    snprintf(json, sizeof(json), "{\"b\":-1,\"r\":%d}", stato_risveglio);
  }

  if (sleepChar.notify((uint8_t*)json, strlen(json))) {
    Serial.print("[BLE] Inviato: ");
    Serial.println(json);
  } else {
    Serial.println("[BLE] Notify fallita");
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("[/] Avvio");

  Wire.begin();
  delay(100);

  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("[X] MAX30105 non trovato!");
    while (1) { Serial.println("[X]"); delay(1000); }
  }
  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x0A);
  particleSensor.setPulseAmplitudeGreen(0);
  Serial.println("[V] MAX30105 pronto");

  writeReg(REG_PWR_MGMT_1, 0x00);
  delay(100);
  writeReg(REG_ACCEL_CFG, 0x00);
  writeReg(REG_GYRO_CFG,  0x00);
  Serial.println("[V] MPU6050 pronto");

  Bluefruit.begin();
  Bluefruit.setName("BraceLeep");
  Bluefruit.setTxPower(4);
  Bluefruit.Security.setIOCaps(false, false, false);
  Bluefruit.Security.setMITM(false);

  Bluefruit.Periph.setConnectCallback(connect_callback);
  Bluefruit.Periph.setDisconnectCallback(disconnect_callback);

  bledis.setManufacturer("BraceLeep");
  bledis.begin();

  blehid.setReportMap(hid_report_descriptor, sizeof(hid_report_descriptor));
  blehid.begin();

  sleepService.begin();
  sleepChar.setProperties(CHR_PROPS_NOTIFY | CHR_PROPS_READ);
  sleepChar.setPermission(SECMODE_OPEN, SECMODE_NO_ACCESS);
  sleepChar.setMaxLen(32);
  sleepChar.begin();

  Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);
  Bluefruit.Advertising.addTxPower();
  Bluefruit.Advertising.addAppearance(BLE_APPEARANCE_GENERIC_HID);
  Bluefruit.Advertising.addName();
  Bluefruit.Advertising.addService(blehid);
  Bluefruit.Advertising.addService(sleepService);
  Bluefruit.Advertising.restartOnDisconnect(true);
  Bluefruit.Advertising.setInterval(32, 244);
  Bluefruit.Advertising.setFastTimeout(30);
  Bluefruit.Advertising.start(0);

  ultimo_invio      = millis();
  campioni_no_polso = 0;
  flag_in_frame     = 0;
  stato_risveglio   = 0;

  Serial.println("[V] Sistema pronto\n");
}

void loop() {
  long irValue = particleSensor.getIR();

  if (irValue < 50000) {
    campioni_no_polso++;
    //Serial.print("[!] Polso non rilevato  ");
  }

  if (checkForBeat(irValue)) {
    long delta = millis() - lastBeat;
    lastBeat = millis();
    beatsPerMinute = 60.0f / (delta / 1000.0f);

    if (beatsPerMinute < 255 && beatsPerMinute > 20) {
      rates[rateSpot++] = (byte)beatsPerMinute;
      rateSpot %= RATE_SIZE;
      beatAvg = 0;
      for (byte x = 0; x < RATE_SIZE; x++) beatAvg += rates[x];
      beatAvg /= RATE_SIZE;
    }
  }

  // Serial.print("IR=");        Serial.print(irValue);
  // Serial.print(", BPM=");     Serial.print(beatsPerMinute);
  // Serial.print(", BPM avg="); Serial.println(beatAvg);

  uint8_t buf[14];
  readBytes(REG_ACCEL_XOUT, buf, 14);

  int16_t ax = toInt16(buf[0],  buf[1]);
  int16_t ay = toInt16(buf[2],  buf[3]);
  int16_t az = toInt16(buf[4],  buf[5]);
  int16_t gx = toInt16(buf[8],  buf[9]);
  int16_t gy = toInt16(buf[10], buf[11]);
  int16_t gz = toInt16(buf[12], buf[13]);

  const float acc_scale  = 2.0f   / 32768.0f;
  const float gyro_scale = 250.0f / 32768.0f;

  float fax = ax * acc_scale,  fay = ay * acc_scale,  faz = az * acc_scale;
  float fgx = gx * gyro_scale, fgy = gy * gyro_scale, fgz = gz * gyro_scale;

  double M = sqrt(pow(fax,2) + pow(fay,2) + pow(faz,2));
  static double prevM = 1.0;
  double deltaM = abs(M - prevM);
  prevM = M;

  double G = sqrt(pow(fgx,2) + pow(fgy,2) + pow(fgz,2));

  if (deltaM > 0.35 || G > 125) {
    movimento_count++;
   // Serial.println("COUNT: ");
    //Serial.print(movimento_count);
  } else {
    movimento_count = 0;
  }

  if (movimento_count > 15) {
    flag_in_frame++;
    movimento_count = 0;

    stato_risveglio = (flag_in_frame >= SOGLIA_FLAG) ? 1 : 0;

    Serial.print("FLAG > ");
    Serial.println(flag_in_frame);
    Serial.print("Soglia: ");
    Serial.println(SOGLIA_FLAG);
    Serial.print("Stato risveglio: ");
    Serial.println(stato_risveglio);
    Serial.println();
  }

  if (millis() - ultimo_invio >= FINESTRA_MS) {
    invia_json();
    ultimo_invio = millis();
  }

  delay(DELAY_TIME);
}