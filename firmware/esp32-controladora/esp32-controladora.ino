#include <esp_now.h>
#include <WiFi.h>
#include <Preferences.h>

const int IN1 = 13, IN2 = 12, IN3 = 14, IN4 = 27;
int velocidade = 1200;

Preferences pref;
uint8_t targetMac[6];
uint8_t broadcastMac[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
bool pareado = false;
unsigned long lastPing = 0;

typedef struct { char comando[10]; int tempo; } ControlPacket;
volatile ControlPacket cmdGlobal;
volatile bool novoCmd = false;

enum Estado { PARADO, ABRINDO, FECHANDO };
Estado estadoAtual = PARADO;
unsigned long tempoInicioMovimento = 0;
int tempoExecutadoMS = 0;

void desligarMotor() {
  digitalWrite(IN1, 0); digitalWrite(IN2, 0);
  digitalWrite(IN3, 0); digitalWrite(IN4, 0);
}

void moverPasso(int stepIdx) {
  int passos[8][4] = {{1,0,0,0},{1,1,0,0},{0,1,0,0},{0,1,1,0},{0,0,1,0},{0,0,1,1},{0,0,0,1},{1,0,0,1}};
  digitalWrite(IN1, passos[stepIdx][0]);
  digitalWrite(IN2, passos[stepIdx][1]);
  digitalWrite(IN3, passos[stepIdx][2]);
  digitalWrite(IN4, passos[stepIdx][3]);
  delayMicroseconds(velocidade);
}

void OnDataRecv(const esp_now_recv_info *info, const uint8_t *incomingData, int len) {
  if (strstr((char*)incomingData, "ACK_CTRL")) {
    if (!pareado) {
      memcpy(targetMac, info->src_addr, 6);
      pref.putBytes("mac", targetMac, 6);
      esp_now_peer_info_t peer = {};
      memcpy(peer.peer_addr, targetMac, 6);
      peer.channel = 1; peer.encrypt = false; peer.ifidx = WIFI_IF_STA;
      esp_now_add_peer(&peer);
      pareado = true;
    }
    lastPing = millis(); // Reseta o timeout de conexão
  } 
  else if (len == sizeof(ControlPacket)) {
    memcpy((void*)&cmdGlobal, (void*)incomingData, sizeof(ControlPacket));
    novoCmd = true;
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  desligarMotor();

  WiFi.mode(WIFI_STA);
  WiFi.setChannel(1); // Forçar canal 1
  WiFi.disconnect();

  if (esp_now_init() != ESP_OK) ESP.restart();
  esp_now_register_recv_cb(OnDataRecv);

  // Registrar Broadcast Peer
  esp_now_peer_info_t bPeer = {};
  memcpy(bPeer.peer_addr, broadcastMac, 6);
  bPeer.channel = 1;
  bPeer.encrypt = false;
  bPeer.ifidx = WIFI_IF_STA;
  esp_now_add_peer(&bPeer);

  pref.begin("seav_ctrl", false);
  if (pref.getBytes("mac", targetMac, 6) > 0) {
    pareado = true;
    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, targetMac, 6);
    peer.channel = 1; peer.encrypt = false; peer.ifidx = WIFI_IF_STA;
    esp_now_add_peer(&peer);
  }
}

void loop() {
  // Se não estiver pareado ou o receptor sumir por mais de 10 segundos
  if (!pareado || (millis() - lastPing > 10000)) {
    const char *msg = "DISC_CTRL";
    esp_now_send(broadcastMac, (uint8_t *)msg, strlen(msg) + 1);
    Serial.println("Tentando reconexão...");
    delay(2000);
    return;
  }

  // Enviar um PING a cada 5 segundos para manter a conexão viva no receptor
  if (millis() - lastPing > 5000) {
     const char *ping = "PING";
     esp_now_send(targetMac, (uint8_t *)ping, strlen(ping) + 1);
  }

  if (novoCmd) {
    novoCmd = false;
    String acao = String((char*)cmdGlobal.comando);
    int tempoAlvoMS = cmdGlobal.tempo * 1000;

    if (estadoAtual != PARADO) {
      tempoExecutadoMS = millis() - tempoInicioMovimento;
      desligarMotor();
      delay(1500); 
      if (acao == "FECHAR" && estadoAtual == ABRINDO) tempoAlvoMS = tempoExecutadoMS;
      else if (acao == "ABRIR" && estadoAtual == FECHANDO) tempoAlvoMS = tempoExecutadoMS;
    }

    estadoAtual = (acao == "ABRIR") ? ABRINDO : FECHANDO;
    tempoInicioMovimento = millis();
    unsigned long fim = millis() + tempoAlvoMS;

    while (millis() < fim && !novoCmd) {
      for (int i = 0; i < 8 && !novoCmd; i++) {
        moverPasso((estadoAtual == ABRINDO) ? i : (7 - i));
      }
    }
    desligarMotor();
    if (!novoCmd) estadoAtual = PARADO;
  }
}