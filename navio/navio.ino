/*
 * ============================================================
 *  Navio GPS Tracker
 *  Hardware: ESP32 + GY-GPS6MV2 (NEO-6M) + SIM800L (SMS fallback)
 * ============================================================
 *
 *  WIRING
 *  ──────
 *  GPS VCC  → ESP32 3.3V  (some modules need 5V — check your board)
 *  GPS GND  → ESP32 GND
 *  GPS TX   → ESP32 GPIO 16  (ESP32 RX2)
 *  GPS RX   → ESP32 GPIO 17  (ESP32 TX2)  ← not strictly needed (read-only)
 *
 *  SIM800L VCC → 4.0V supply (NOT ESP32 3.3V — needs ~2A burst on TX,
 *                will brown out the ESP32). Use a separate buck or LiPo.
 *  SIM800L GND → ESP32 GND   (common ground required)
 *  SIM800L TXD → ESP32 GPIO 5   (ESP32 RX1)
 *  SIM800L RXD → ESP32 GPIO 4   (ESP32 TX1)  — level-shift to 2.8V if strict;
 *                                              5V-tolerant in practice on most boards.
 *
 *  LIBRARIES  (install via Arduino Library Manager)
 *  ─────────────────────────────────────────────────
 *  - TinyGPS++    by Mikal Hart
 *  - ArduinoJson  by Benoit Blanchon  (v6.x)
 *
 *  BOARD
 *  ─────
 *  Arduino IDE → Tools → Board → "ESP32 Dev Module"
 *
 *  HOW IT WORKS
 *  ────────────
 *  1. On boot, loads saved WiFi credentials from flash (Preferences).
 *  2a. If credentials exist and connect OK → STA mode.
 *      Posts GPS data to your server every UPLOAD_INTERVAL_MS (HTTP).
 *      http://navio.local still works — visit it to switch networks.
 *  2b. If no credentials / connection fails → AP mode.
 *      Creates WiFi hotspot "Navio" (password: "password").
 *      Browse to http://navio.local — pick a network, enter password.
 *      Saves credentials and reboots into STA mode.
 *  3. If WiFi drops in STA mode, tries to reconnect MAX_RECONNECT_TRIES
 *     times, then falls back to AP mode so you can reconfigure.
 *  4. SMS PATH (always-on, runs in parallel with HTTP):
 *      Every SMS_INTERVAL_MS the device sends one SMS to PHONE_NUMBER
 *      with payload "NAVIO|<device_id>|<lat>|<lng>|<speed>|<sats>".
 *      The receiving phone number is a Twilio (or Semaphore) inbound
 *      number that webhooks the message into /api/sms on your server.
 *      SMS keeps working even with no WiFi — it's the offline fallback.
 *
 *  LED SIGNALS  (built-in blue LED, GPIO 2)
 *  ─────────────────────────────────────────
 *  AP mode (no WiFi)      : slow blink — 1s on / 1s off
 *  STA, no GPS fix        : fast blink — 100ms on / 100ms off
 *  STA, GPS fix acquired  : long pulse — 1s on / 2s off
 *  Upload success         : 3 rapid blinks (80ms) then resumes background blink
 *  Upload failed          : 2 slow blinks (500ms) then resumes background blink
 * ============================================================
 */

#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <TinyGPS++.h>
#include <HardwareSerial.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// ── Pin / UART config ──────────────────────────────────────
#define GPS_RX_PIN      16        // ESP32 RX2 ← GPS TX  (UART2)
#define GPS_TX_PIN      17        // ESP32 TX2 → GPS RX  (UART2)
#define GPS_BAUD        9600

// ── SIM800L (SMS) ──────────────────────────────────────────
// UART1 — kept separate from GPS UART2 so both run at the same time.
// ESP32 HardwareSerial.begin(baud, cfg, rxPin, txPin) — note the order:
// rx first, tx second. Wire SIM TX → ESP32 RX, SIM RX → ESP32 TX.
#define SIM_RX_PIN      5         // ESP32 RX1 ← SIM TXD
#define SIM_TX_PIN      4         // ESP32 TX1 → SIM RXD
#define SIM_BAUD        9600

// Destination number for SMS uploads. Use full E.164 format (+country...).
// This must be a Twilio (or Semaphore/etc.) inbound-capable number that
// is webhooked to your /api/sms endpoint.
// Twilio inbound number (US). E.164 format required — leading "+"
// tells the SIM800L to dial international. Your SIM card must have
// international SMS enabled / sufficient load (Globe/Smart: usually
// works by default on prepaid, ~₱15/msg).
#define SMS_TO_NUMBER   "+16513774630"

// ── LED ────────────────────────────────────────────────────
#define LED_PIN         2         // Built-in blue LED on most ESP32 dev boards

// ── Access-Point config ────────────────────────────────────
#define AP_SSID         "Navio"
#define AP_PASSWORD     "password"
#define HOSTNAME        "navio"   // → http://navio.local

// ── Upload URL ─────────────────────────────────────────────
#define UPLOAD_URL      "https://navio.cjuy.dev/api/location"

// ── Device identity ────────────────────────────────────────
// Change this string on each physical device you flash
#define DEVICE_ID       "bracelet-001"

// ── Timing ─────────────────────────────────────────────────
#define UPLOAD_INTERVAL_MS   10000UL    // HTTP upload every 10 s (WiFi path)
#define SMS_INTERVAL_MS      900000UL   // SMS upload every 15 min (cellular path)
#define SIM_BOOT_DELAY_MS    8000UL     // SIM800L cold-boot settle time
#define WIFI_TIMEOUT_MS      15000UL    // max wait when joining a network
#define MAX_RECONNECT_TRIES  3          // before falling back to AP mode

// Set to 1 to send SMS only when WiFi is unavailable (saves money).
// Set to 0 to ALWAYS send SMS in parallel with HTTP (redundant but safe).
#define SMS_ONLY_AS_FALLBACK 0

// ── SIM balance (carrier-specific) ─────────────────────────
// Two methods:
//   USSD : dial *123# (Smart) — returns regular load only, can't see
//          active promos / Flexi / Power ALL allocations.
//   SMS  : text STATUS to 214 — returns full promo breakdown including
//          GB remaining, expiry, etc. Free on Smart. Slower (~10–30 s
//          for Smart's reply) but the only way to see promo balance.
//
// Set to 1 to use the SMS-based query, 0 for USSD.
// Smart RC:1100 — BAL to 214 retired. RC:2099 — PROMO/STATUS unavailable.
// USSD *123# is the only working path. Returns main menu w/ balance +
// active promo list (POWER ALL etc.). For deeper allocation (GB left)
// you'd need interactive USSD nav — not implemented.
#define BALANCE_USE_SMS 0
#define BALANCE_USSD    "*123#"
#define BALANCE_SHORTCODE "214"
#define BALANCE_KEYWORD "PROMO"
#define BALANCE_URL     "https://navio.cjuy.dev/api/balance"


// ═══════════════════════════════════════════════════════════
//  Globals
// ═══════════════════════════════════════════════════════════
Preferences     prefs;
WebServer       server(80);
TinyGPSPlus     gps;
HardwareSerial  gpsSerial(2);   // UART2 — GPS
HardwareSerial  simSerial(1);   // UART1 — SIM800L

String          savedSSID, savedPass;
bool            wifiConnected      = false;
bool            simReady           = false;   // SIM responded to AT and registered
unsigned long   lastUpload         = 0;       // last HTTP upload timestamp
unsigned long   lastSmsUpload      = 0;       // last SMS upload timestamp
bool            balancePending     = true;    // request balance refresh (boot + after each SMS)
unsigned long   lastProgressPrint  = 0;
bool            ledState           = false;
int             reconnectCount     = 0;
bool            firstSmsPending    = true;    // fire SMS immediately on first GPS fix
String          lastBalanceText    = "";      // last balance reply (cached for re-POST)


// ═══════════════════════════════════════════════════════════
//  LED helpers — STEALTH MODE
//  -----------------------------------------------------------
//  All LED activity disabled for discretion. Functions kept as
//  no-ops so call sites elsewhere in the file don't need edits.
//  Note: the red power LED on most ESP32 dev boards is hardwired
//  to VCC and CANNOT be turned off in software — desolder it if
//  you need true darkness.
// ═══════════════════════════════════════════════════════════

void ledBlink(int /*times*/, int /*onMs*/, int /*offMs*/) {
  // intentionally empty — stealth mode
}

void ledTick(int /*mode*/) {
  // intentionally empty — stealth mode
}


// ═══════════════════════════════════════════════════════════
//  HTML — captive portal / network switcher
// ═══════════════════════════════════════════════════════════
String buildSetupPage() {
  int n = WiFi.scanNetworks();

  String options = "";
  for (int i = 0; i < n; i++) {
    String ssid = WiFi.SSID(i);
    ssid.replace("\"", "&quot;");
    options += "<option value=\"" + ssid + "\">"
             + ssid + " (" + String(WiFi.RSSI(i)) + " dBm)</option>\n";
  }
  if (n == 0) options = "<option value=''>No networks found — refresh page</option>";

  return R"html(<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Navio Setup</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',sans-serif;background:#0a0a0f;color:#e0e0e0;
       display:flex;justify-content:center;align-items:center;min-height:100vh}
  .card{background:#14141e;border:1px solid #2a2a3e;border-radius:16px;
        padding:2rem;width:90%;max-width:400px}
  h1{font-size:1.5rem;margin-bottom:.25rem}
  .sub{color:#666;font-size:.85rem;margin-bottom:1.5rem}
  label{display:block;font-size:.78rem;color:#aaa;margin:.9rem 0 .25rem}
  select,input{width:100%;padding:.65rem .9rem;background:#1a1a2a;
               border:1px solid #333;border-radius:8px;color:#fff;font-size:.9rem}
  select:focus,input:focus{outline:none;border-color:#6456ff}
  button{margin-top:1.3rem;width:100%;padding:.75rem;background:#6456ff;
         border:none;border-radius:8px;color:#fff;font-size:.95rem;cursor:pointer}
  button:hover{background:#7a70ff}
  small{display:block;margin-top:.9rem;color:#555;font-size:.75rem;text-align:center}
</style>
</head>
<body>
<div class="card">
  <h1>📍 Navio</h1>
  <p class="sub">Connect the tracker to your WiFi</p>
  <form method="POST" action="/connect">
    <label>Network</label>
    <select name="ssid">)html"
    + options +
    R"html(</select>
    <label>Password</label>
    <input type="password" name="password" placeholder="WiFi password">
    <button type="submit">Save &amp; Connect</button>
  </form>
  <small>The device will restart and begin uploading your location.</small>
</div>
</body>
</html>)html";
}

const char HTML_CONNECTING[] = R"html(<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta http-equiv="refresh" content="14;url=/">
<style>
  body{font-family:'Segoe UI',sans-serif;background:#0a0a0f;color:#e0e0e0;
       display:flex;justify-content:center;align-items:center;height:100vh}
  .card{text-align:center;background:#14141e;border:1px solid #2a2a3e;
        border-radius:16px;padding:2.5rem;max-width:340px}
  h2{color:#fff;margin-top:.5rem}
  p{color:#666;margin-top:.75rem;font-size:.88rem;line-height:1.5}
  .spinner{margin:1.2rem auto;width:38px;height:38px;border:3px solid #2a2a3e;
           border-top-color:#6456ff;border-radius:50%;animation:s 1s linear infinite}
  @keyframes s{to{transform:rotate(360deg)}}
</style></head>
<body><div class="card">
  <div class="spinner"></div>
  <h2>Connecting…</h2>
  <p>Credentials saved. The device will restart automatically if the connection succeeds.<br><br>
     If it fails, this setup page will reappear.</p>
</div></body></html>)html";


// ═══════════════════════════════════════════════════════════
//  Web server routes (shared between AP and STA mode)
// ═══════════════════════════════════════════════════════════
void registerWebRoutes() {
  server.on("/", HTTP_GET, []() {
    server.send(200, "text/html", buildSetupPage());
  });

  server.on("/connect", HTTP_POST, []() {
    String ssid = server.arg("ssid");
    String pass = server.arg("password");

    if (ssid.isEmpty()) {
      server.send(400, "text/plain", "No SSID provided.");
      return;
    }

    server.send(200, "text/html", HTML_CONNECTING);

    prefs.begin("wifi", false);
    prefs.putString("ssid", ssid);
    prefs.putString("pass", pass);
    prefs.end();

    Serial.printf("[Web] Saved credentials for \"%s\". Rebooting...\n", ssid.c_str());
    delay(1000);
    ESP.restart();
  });

  server.onNotFound([]() {
    server.sendHeader("Location", "http://navio.local/", true);
    server.send(302, "text/plain", "");
  });

  server.begin();
}


// ═══════════════════════════════════════════════════════════
//  WiFi helpers
// ═══════════════════════════════════════════════════════════
bool tryConnectWiFi(const String& ssid, const String& pass) {
  Serial.printf("[WiFi] Connecting to \"%s\"...\n", ssid.c_str());
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), pass.c_str());

  unsigned long t = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - t > WIFI_TIMEOUT_MS) {
      Serial.println("[WiFi] Timed out.");
      return false;
    }
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.printf("[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  reconnectCount = 0;
  return true;
}

void startAPMode() {
  Serial.println("[AP] Starting access point...");
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASSWORD);
  Serial.printf("[AP] SSID: %s  IP: %s\n",
                AP_SSID, WiFi.softAPIP().toString().c_str());

  if (MDNS.begin(HOSTNAME)) {
    Serial.println("[mDNS] navio.local is active");
  }

  registerWebRoutes();
}


// ═══════════════════════════════════════════════════════════
//  SIM800L helpers
//  -----------------------------------------------------------
//  The SIM800L speaks AT commands over UART. Pattern is always:
//     1. send "AT+SOMETHING\r\n"
//     2. read everything that comes back until idle
//     3. look for "OK" / "ERROR" / specific tokens
//  simCollect() implements step 2 with an idle-timeout — it keeps
//  reading as long as bytes are arriving and only returns once the
//  module has been quiet for ~200 ms (or the deadline expires).
// ═══════════════════════════════════════════════════════════

String simCollect(unsigned long timeoutMs) {
  String out;
  unsigned long deadline = millis() + timeoutMs;
  while (millis() < deadline) {
    while (simSerial.available()) {
      char c = simSerial.read();
      out += c;
      // Reset the idle window on every received byte so we keep
      // reading multi-line responses without truncating.
      deadline = millis() + 200;
    }
  }
  out.trim();
  return out;
}

// Ping the module with bare "AT" until it answers OK. The SIM800L
// can take several seconds to come up after power-on — that's why
// setup() also does a coarse delay before this is called.
bool simWaitForOK() {
  for (int i = 1; i <= 10; i++) {
    simSerial.println("AT");
    String r = simCollect(1500);
    Serial.printf("[SIM] AT attempt %d/10 → [%s]\n", i, r.c_str());
    if (r.indexOf("OK") >= 0) return true;
  }
  return false;
}

// AT+CREG? returns "+CREG: <n>,<stat>". stat=1 → registered home,
// stat=5 → registered roaming. Anything else means not yet on network.
bool simWaitForNetwork() {
  for (int i = 1; i <= 60; i++) {
    simSerial.println("AT+CREG?");
    String r = simCollect(2000);
    if (r.indexOf(",1") >= 0 || r.indexOf(",5") >= 0) {
      Serial.printf("[SIM] Network registered after %ds\n", i);
      return true;
    }
    delay(500);
  }
  Serial.println("[SIM] Network registration timed out.");
  return false;
}

// One-time module bring-up. Call from setup().
bool simInit() {
  Serial.println("[SIM] Booting SIM800L...");
  simSerial.begin(SIM_BAUD, SERIAL_8N1, SIM_RX_PIN, SIM_TX_PIN);
  delay(SIM_BOOT_DELAY_MS);
  while (simSerial.available()) simSerial.read();   // flush boot noise

  if (!simWaitForOK()) {
    Serial.println("[SIM] No response. Check power/wiring.");
    return false;
  }
  if (!simWaitForNetwork()) return false;

  // Switch to text-mode SMS once. Stays set until power loss.
  simSerial.println("AT+CMGF=1");
  simCollect(2000);
  return true;
}

// Read SIM serial until any of the supplied tokens appears in the
// buffer, or the hard timeout expires. Returns the full buffer text
// regardless of outcome — caller checks for tokens itself.
//
// We need this for async URC-style replies (like +CMGS for SMS or
// +CUSD for USSD) where the module may go silent for many seconds
// between an immediate "OK" and the actual network confirmation.
// simCollect's 200 ms idle window exits early in those gaps.
String simWaitForAny(const char* a, const char* b, unsigned long timeoutMs) {
  String buf;
  unsigned long deadline = millis() + timeoutMs;
  while (millis() < deadline) {
    while (simSerial.available()) buf += (char)simSerial.read();
    if (a && buf.indexOf(a) >= 0) return buf;
    if (b && buf.indexOf(b) >= 0) return buf;
    delay(20);
  }
  return buf;
}

// Send one SMS. Blocking — typical wall time ~5–10 s.
// Returns true if module reported "+CMGS:" (queued for delivery).
bool sendSMS(const char* number, const String& message) {
  if (!simReady) return false;

  // CMGS expects the number in a quoted string, then the body, then
  // a literal Ctrl+Z (0x1A) byte to mark end-of-message.
  simSerial.print("AT+CMGS=\"");
  simSerial.print(number);
  simSerial.println("\"");
  // Wait for the "> " prompt instead of generic idle. Some firmwares
  // send the prompt 1–2 s after the AT, well past simCollect's 200 ms.
  String r1 = simWaitForAny(">", "ERROR", 5000);
  if (r1.indexOf('>') < 0) {
    Serial.printf("[SIM] No '>' prompt: [%s]\n", r1.c_str());
    return false;
  }

  simSerial.print(message);
  delay(100);
  simSerial.write(26);                  // Ctrl+Z = send

  // Wait specifically for "+CMGS" (success URC) or "ERROR". Network
  // confirmation can land 2–15 s later. simCollect would exit too
  // early on short messages and we'd see only the echoed body.
  String r2 = simWaitForAny("+CMGS", "ERROR", 30000);
  Serial.printf("[SIM] CMGS reply: [%s]\n", r2.c_str());
  return r2.indexOf("+CMGS") >= 0;
}

// Query prepaid balance via USSD. Returns true if a response was
// captured into `out`. Smart's *214# replies with text like
// "Your balance is P 47.00 valid until ...". Globe/DITO format
// differs but we don't parse — we send the raw text to the server
// and let the server display it.
//
// AT+CUSD=1,"<code>",15
//   1  → enable result codes
//   15 → GSM 7-bit alphabet (works for plain ASCII replies)
//
// Module reply pattern:
//   OK
//   +CUSD: 0,"Your balance is P 47.00...",15
// Poll the SIM serial port until a complete +CUSD URC has arrived
// (i.e. we've seen `+CUSD:` followed by a fully-closed quoted body
// and then a brief drain), OR the hard timeout expires.
//
// USSD is two-phase: the module ACKs with "OK" instantly, then the
// real reply trickles in seconds later from the network. The simple
// idle-timeout collector exits after the OK and misses the URC, so
// we need this token-aware waiter for USSD specifically.
String simWaitForCUSD(unsigned long timeoutMs) {
  String buf;
  unsigned long deadline = millis() + timeoutMs;
  bool sawCusd = false;
  int  cusdAt  = -1;
  unsigned long quietSince = 0;

  while (millis() < deadline) {
    while (simSerial.available()) {
      buf += (char)simSerial.read();
      quietSince = millis();
    }

    // Look for the URC. We anchor on "+CUSD:" specifically — the
    // echoed command line uses "+CUSD=" (equals sign), so this won't
    // false-match the echo.
    if (!sawCusd) {
      cusdAt = buf.indexOf("+CUSD:");
      if (cusdAt >= 0) sawCusd = true;
    }

    // Once seen, look for the fully-quoted body and a small drain
    // window so we get any trailing ",15\r\n".
    if (sawCusd) {
      int q1 = buf.indexOf('"', cusdAt);
      int q2 = (q1 >= 0) ? buf.indexOf('"', q1 + 1) : -1;
      if (q1 >= 0 && q2 > q1 && quietSince > 0
          && (millis() - quietSince) > 150) {
        return buf;
      }
    }

    delay(20);
  }
  return buf;   // timed out — caller will see no +CUSD in result
}

bool simQueryBalance(String& out) {
  if (!simReady) return false;

  // Drain any stale data from prior commands so it doesn't pollute
  // our search for the +CUSD URC below.
  while (simSerial.available()) simSerial.read();

  // Enable USSD result codes. Some firmwares default to disabled.
  // Idempotent — safe to call every time.
  simSerial.println("AT+CUSD=1");
  simCollect(1000);
  while (simSerial.available()) simSerial.read();   // drain again

  // Fire the actual query. ",15" = GSM 7-bit alphabet for the reply.
  simSerial.print("AT+CUSD=1,\"");
  simSerial.print(BALANCE_USSD);
  simSerial.println("\",15");

  // USSD round-trip can take 3–15 s on Smart. Wait for the URC,
  // not just for idle.
  String r = simWaitForCUSD(25000);
  Serial.printf("[USSD] raw: [%s]\n", r.c_str());

  int idx = r.indexOf("+CUSD:");
  if (idx < 0) return false;
  int q1 = r.indexOf('"', idx);
  int q2 = r.indexOf('"', q1 + 1);
  if (q1 < 0 || q2 <= q1) return false;

  String reply = r.substring(q1 + 1, q2);
  reply.trim();

  // Some firmware/carrier combos return a placeholder echoing the
  // dial code (e.g. "*214#") before the real reply, then send a
  // second URC. If that's all we got, treat as failure so the loop
  // retries — better to retry than to display garbage on the site.
  if (reply.length() == 0) return false;
  if (reply == BALANCE_USSD) {
    Serial.println("[USSD] got dial-code echo, not real reply — treating as failure");
    return false;
  }

  out = reply;
  return true;
}

// Send STATUS to 214, wait for the reply SMS, read its body.
// Returns true if a reply was captured into `out`.
//
// Flow:
//   1. Wipe SIM message storage so we don't pick up stale replies.
//   2. Configure new-message indication so the module emits +CMTI URCs.
//   3. Send the SMS via the existing sendSMS() path.
//   4. Watch the SIM serial for "+CMTI: \"SM\",<idx>" — this fires
//      when a new SMS lands. Smart's STATUS replies typically arrive
//      in 5–30 seconds.
//   5. Read body via AT+CMGR=<idx>, then AT+CMGD=<idx> to delete it.
bool simQueryBalanceViaSMS(String& out) {
  if (!simReady) return false;

  // Wipe storage and enable new-message URCs. AT+CNMI=2,1: route
  // delivery indication to TE (us), don't push the body inline.
  simSerial.println("AT+CMGD=1,4");        // delete all stored SMS
  simCollect(2500);
  simSerial.println("AT+CNMI=2,1,0,0,0");  // enable +CMTI URCs
  simCollect(1500);
  while (simSerial.available()) simSerial.read();   // drain noise

  Serial.printf("[Balance] sending %s to %s...\n",
                BALANCE_KEYWORD, BALANCE_SHORTCODE);
  if (!sendSMS(BALANCE_SHORTCODE, BALANCE_KEYWORD)) {
    Serial.println("[Balance] STATUS SMS send failed");
    return false;
  }

  // Wait up to 45 s for the reply. Smart usually replies in <15 s but
  // promos sometimes take longer.
  unsigned long deadline = millis() + 45000UL;
  String buf;
  int msgIdx = -1;

  while (millis() < deadline && msgIdx < 0) {
    while (simSerial.available()) buf += (char)simSerial.read();

    int cmti = buf.indexOf("+CMTI:");
    if (cmti >= 0) {
      // Find the first digit run after "+CMTI:" — that's the index.
      int comma = buf.indexOf(',', cmti);
      if (comma >= 0) {
        String numStr;
        for (size_t i = comma + 1; i < buf.length(); i++) {
          char c = buf[i];
          if (c >= '0' && c <= '9') numStr += c;
          else if (numStr.length() > 0) break;
        }
        if (numStr.length() > 0) msgIdx = numStr.toInt();
      }
    }
    delay(100);
  }

  if (msgIdx < 0) {
    Serial.println("[Balance] Timed out waiting for STATUS reply");
    return false;
  }
  Serial.printf("[Balance] inbound SMS at index %d\n", msgIdx);

  // Read the message. Reply format from SIM800L:
  //   +CMGR: "REC UNREAD","214",,"26/05/08,12:34:56+32"
  //   <body line(s)>
  //   <blank>
  //   OK
  simSerial.print("AT+CMGR=");
  simSerial.println(msgIdx);
  String r = simCollect(6000);

  int hdr = r.indexOf("+CMGR:");
  if (hdr < 0) {
    Serial.printf("[Balance] CMGR missing header: [%s]\n", r.c_str());
    return false;
  }
  int hdrEnd = r.indexOf('\n', hdr);
  if (hdrEnd < 0) return false;

  // Body runs from hdrEnd+1 up to the trailing OK.
  int okIdx = r.lastIndexOf("OK");
  String body = (okIdx > hdrEnd)
                  ? r.substring(hdrEnd + 1, okIdx)
                  : r.substring(hdrEnd + 1);
  body.trim();

  // Free up SIM storage for next round.
  simSerial.print("AT+CMGD=");
  simSerial.println(msgIdx);
  simCollect(2000);

  if (body.length() == 0) return false;
  out = body;
  return true;
}

// Dispatch to the configured balance method (SMS or USSD).
bool queryBalance(String& out) {
#if BALANCE_USE_SMS
  return simQueryBalanceViaSMS(out);
#else
  return simQueryBalance(out);
#endif
}

// POST balance text to /api/balance. Server stores latest value
// per device for display on the website. Only call when WiFi is up.
bool postBalance(const String& text) {
  HTTPClient http;
  http.begin(BALANCE_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(8000);

  StaticJsonDocument<384> doc;
  doc["device_id"] = DEVICE_ID;
  doc["balance"]   = text;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  http.end();
  Serial.printf("[Balance] POST → %d\n", code);
  return code >= 200 && code < 300;
}

// Build the compact pipe-delimited payload the webhook parses.
// Format: NAVIO|<device_id>|<lat>|<lng>|<speed_kmh>|<sats>
// Lat/lng kept to 6 decimals (~11 cm precision), full message stays
// well under the 160-char single-segment SMS limit.
String buildSmsPayload(double lat, double lng, double spd, int sats) {
  char buf[160];
  snprintf(buf, sizeof(buf),
           "NAVIO|%s|%.6f|%.6f|%.1f|%d",
           DEVICE_ID, lat, lng, spd, sats);
  return String(buf);
}


// ═══════════════════════════════════════════════════════════
//  GPS upload  — returns true on HTTP 2xx
// ═══════════════════════════════════════════════════════════
bool uploadLocation(double lat, double lng, double speedKmh, int satellites) {
  HTTPClient http;
  http.begin(UPLOAD_URL);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(8000);

  StaticJsonDocument<256> doc;
  doc["device_id"]  = DEVICE_ID;
  doc["lat"]        = lat;
  doc["lng"]        = lng;
  doc["speed_kmh"]  = speedKmh;
  doc["satellites"] = satellites;

  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  http.end();

  if (code >= 200 && code < 300) {
    Serial.printf("[Upload] HTTP %d — OK\n", code);
    return true;
  }
  Serial.printf("[Upload] Failed: %s (code %d)\n",
                http.errorToString(code).c_str(), code);
  return false;
}


// ═══════════════════════════════════════════════════════════
//  Setup
// ═══════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n[Boot] Navio GPS Tracker");

  // Stealth mode — keep LED pin tri-stated so it doesn't light up.
  pinMode(LED_PIN, INPUT);

  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("[GPS] UART2 started");

  // Bring up SIM800L. If it fails we keep going — HTTP path may
  // still work — but SMS uploads will be skipped.
  simReady = simInit();
  Serial.printf("[SIM] %s\n", simReady ? "READY" : "UNAVAILABLE");

  prefs.begin("wifi", true);
  savedSSID = prefs.getString("ssid", "");
  savedPass = prefs.getString("pass", "");
  prefs.end();

  if (savedSSID.length() > 0) {
    Serial.printf("[Boot] Saved SSID: \"%s\"\n", savedSSID.c_str());
    wifiConnected = tryConnectWiFi(savedSSID, savedPass);
  } else {
    Serial.println("[Boot] No saved WiFi credentials.");
  }

  if (!wifiConnected) {
    startAPMode();
  } else {
    MDNS.begin(HOSTNAME);
    registerWebRoutes();
    Serial.printf("[Boot] Uploading every %lu s\n", UPLOAD_INTERVAL_MS / 1000);

    // Boot-time balance refresh — runs immediately after WiFi is up so
    // the website shows current load before any SMS has fired. Only
    // attempts if the SIM module came up successfully.
    if (simReady) {
      String bal;
      if (queryBalance(bal)) {
        Serial.printf("[Balance] %s\n", bal.c_str());
        lastBalanceText = bal;
        if (postBalance(bal)) {
          balancePending = false;       // boot refresh done
        }
      } else {
        Serial.println("[Balance] USSD query failed at boot — will retry in loop");
      }
    }
  }

  Serial.println("[LED] Stealth mode — all blinking disabled.");
}


// ═══════════════════════════════════════════════════════════
//  Loop
// ═══════════════════════════════════════════════════════════
void loop() {
  // Feed GPS parser
  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }

  // Serve the web portal in both AP and STA mode
  server.handleClient();

  // ── SMS upload (independent of WiFi) ─────────────────────
  // Runs in any mode (AP or STA). Fires:
  //   - immediately on the FIRST GPS fix after boot, then
  //   - every SMS_INTERVAL_MS after that.
  //   - if SMS_ONLY_AS_FALLBACK is set, only when WiFi is down.
  if (simReady && gps.location.isValid()) {
    bool wifiPathOk = wifiConnected && WiFi.status() == WL_CONNECTED;
    bool smsAllowed = !SMS_ONLY_AS_FALLBACK || !wifiPathOk;
    bool intervalElapsed = (millis() - lastSmsUpload) >= SMS_INTERVAL_MS;
    if (smsAllowed && (firstSmsPending || intervalElapsed)) {
      double lat  = gps.location.lat();
      double lng  = gps.location.lng();
      double spd  = gps.speed.isValid()      ? gps.speed.kmph()            : 0.0;
      int    sats = gps.satellites.isValid() ? (int)gps.satellites.value() : 0;

      String payload = buildSmsPayload(lat, lng, spd, sats);
      Serial.printf("[SMS] → %s : %s%s\n",
                    SMS_TO_NUMBER, payload.c_str(),
                    firstSmsPending ? "  (FIRST FIX)" : "");
      bool ok = sendSMS(SMS_TO_NUMBER, payload);
      Serial.printf("[SMS] %s\n", ok ? "delivered to carrier" : "FAILED");

      // Mark interval start regardless of success — failed SMS still
      // costs ~10 s of module time, don't hammer it. Clear first-fire
      // only on success so a failed first attempt retries on next loop.
      lastSmsUpload = millis();
      if (ok) {
        firstSmsPending = false;
        // Each SMS costs load — flag a balance refresh so the website
        // shows current credit. Will fire below when WiFi is available.
        balancePending = true;
      }
    }
  }

  // ── Balance refresh (USSD → HTTP) ────────────────────────
  // Fires only when:
  //   - balancePending is set (boot OR after a successful SMS)
  //   - SIM module is ready
  //   - WiFi is connected (server otherwise unreachable)
  // The USSD query itself does NOT cost load — it's free.
  if (balancePending && simReady && wifiConnected
      && WiFi.status() == WL_CONNECTED) {
    String bal;
    if (queryBalance(bal)) {
      Serial.printf("[Balance] %s\n", bal.c_str());
      lastBalanceText = bal;
      if (postBalance(bal)) balancePending = false;
      // If USSD worked but HTTP failed, leave balancePending=true
      // so the next loop retries the POST without re-querying USSD.
    } else {
      Serial.println("[Balance] USSD query failed — will retry");
      // Don't clear the flag; try again next loop iteration. USSD
      // can flake on weak signal — a retry usually succeeds.
    }
  }

  // ── AP mode: slow blink, nothing else to do ──────────────
  if (!wifiConnected) {
    ledTick(0);
    return;
  }

  // ── STA mode ─────────────────────────────────────────────

  // Reconnect if dropped
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println();
    Serial.println("[WiFi] Lost connection, reconnecting...");
    reconnectCount++;
    if (reconnectCount <= MAX_RECONNECT_TRIES) {
      wifiConnected = tryConnectWiFi(savedSSID, savedPass);
    } else {
      Serial.println("[WiFi] Giving up, falling back to AP mode.");
      wifiConnected  = false;
      reconnectCount = 0;
      startAPMode();
    }
    return;
  }

  bool hasFix = gps.location.isValid();

  // Background LED: fast = no fix, long pulse = fix
  ledTick(hasFix ? 2 : 1);

  unsigned long now = millis();

  // Progress bar — redraws every second
  if (now - lastProgressPrint >= 1000) {
    lastProgressPrint = now;

    unsigned long elapsed   = now - lastUpload;
    if (elapsed > UPLOAD_INTERVAL_MS) elapsed = UPLOAD_INTERVAL_MS;
    unsigned long remaining = (UPLOAD_INTERVAL_MS - elapsed) / 1000;
    int filled = (int)((elapsed * 20UL) / UPLOAD_INTERVAL_MS);

    char bar[21];
    for (int i = 0; i < 20; i++) bar[i] = (i < filled) ? '#' : '-';
    bar[20] = '\0';

    Serial.printf("[GPS] [%s] %2lus  (%s)\n",
                  bar, remaining, hasFix ? "fix OK" : "searching");
  }

  // Upload on interval
  if (now - lastUpload >= UPLOAD_INTERVAL_MS) {
    lastUpload = now;
    Serial.println();

  if (hasFix) {
    double lat  = gps.location.lat();
    double lng  = gps.location.lng();
    double spd  = gps.speed.isValid()      ? gps.speed.kmph()            : 0.0;
    int    sats = gps.satellites.isValid() ? (int)gps.satellites.value() : 0;

    Serial.printf("[GPS] lat=%.6f  lng=%.6f  speed=%.1f km/h  sats=%d\n",
                  lat, lng, spd, sats);

    bool ok = false;
    for (int attempt = 1; attempt <= 3; attempt++) {
      Serial.printf("[Upload] Attempt %d/3...\n", attempt);
      ok = uploadLocation(lat, lng, spd, sats);
      if (ok) break;
      if (attempt < 3) delay(2000);  // wait 2s before retrying
    }

    if (ok) {
      ledBlink(3, 80, 80);    // ✅ 3 rapid blinks = upload success
    } else {
      ledBlink(2, 500, 500);  // ❌ 2 slow blinks  = all 3 attempts failed
    }
  } else {
      Serial.printf("[GPS] No fix — chars=%lu  fixes=%lu  bad=%lu\n",
                    gps.charsProcessed(), gps.sentencesWithFix(), gps.failedChecksum());
      // No burst blink here — fast background blink already signals no fix
    }
  }
}
