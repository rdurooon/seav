#include <esp_now.h>
#include <WiFi.h>
#include <Preferences.h>

#define MAX_PAYLOAD_SIZE 235
#define MAX_IMAGE_SIZE 40000

typedef struct {
  uint16_t frame_id;
  uint16_t total_chunks;
  uint16_t chunk_index;
  uint16_t payload_len;
  uint8_t payload[MAX_PAYLOAD_SIZE];
} DataPacket;

typedef struct {
  char comando[10];
  int tempo;
} ControlPacket;

Preferences pref;
uint8_t macControladora[6];
bool ctrlPareada = false;
uint8_t frame_buffer[MAX_IMAGE_SIZE];
uint16_t current_frame_id = 0;
uint16_t chunks_received = 0;
bool cameraConectada = false;
bool controladoraConectada = false;

void enviarLog(String mensagem) {
  Serial.print("LOG:"); 
  Serial.println(mensagem);
  Serial.flush();
}

void enviarStatus() {
  String statusMsg = "STATUS:";
  if (!cameraConectada && !controladoraConectada) statusMsg += "❌";
  else if (cameraConectada && controladoraConectada) statusMsg += "✅";
  else statusMsg += "1/2";
  Serial.println(statusMsg);
}

void OnDataRecv(const esp_now_recv_info *info, const uint8_t *incomingData, int len) {
  // 1. Processamento de Imagem
  if (len == sizeof(DataPacket)) {
    DataPacket *packet = (DataPacket *)incomingData;
    if (packet->frame_id != current_frame_id) {
      current_frame_id = packet->frame_id;
      chunks_received = 0;
    }
    size_t offset = packet->chunk_index * MAX_PAYLOAD_SIZE;
    if (offset + packet->payload_len <= MAX_IMAGE_SIZE) {
      memcpy(frame_buffer + offset, packet->payload, packet->payload_len);
      chunks_received++;
    }
    if (chunks_received == packet->total_chunks || packet->chunk_index == packet->total_chunks - 1) {
      uint32_t final_size = (packet->total_chunks - 1) * MAX_PAYLOAD_SIZE + packet->payload_len;
      Serial.print("START_IMG");
      Serial.write(frame_buffer, final_size);
      Serial.print("END_IMG");
      Serial.flush(); 
      chunks_received = 0; current_frame_id = 0; 
    }
    cameraConectada = true; // Se recebeu imagem, a câmera está viva
    enviarStatus();
    return;
  }

  // 2. Processamento de Mensagens de Controle/Discovery
  char msg[len + 1];
  memcpy(msg, incomingData, len);
  msg[len] = '\0';

  if (strstr(msg, "DISC_CTRL") || strstr(msg, "PING")) {
    if (!esp_now_is_peer_exist(info->src_addr)) {
      esp_now_peer_info_t peer = {};
      memcpy(peer.peer_addr, info->src_addr, 6);
      peer.channel = 1; 
      peer.encrypt = false;
      peer.ifidx = WIFI_IF_STA;
      esp_now_add_peer(&peer);
    }
    
    // Se for um novo pareamento
    if (strstr(msg, "DISC_CTRL")) {
      memcpy(macControladora, info->src_addr, 6);
      pref.putBytes("macCtrl", macControladora, 6);
      ctrlPareada = true;
      enviarLog("Nova Controladora vinculada!");
    }

    const char *reply = "ACK_CTRL";
    esp_now_send(info->src_addr, (uint8_t *)reply, strlen(reply) + 1);
    controladoraConectada = true;
    enviarStatus();
  }
  
  else if (strstr(msg, "DISC_CAM")) {
    if (!esp_now_is_peer_exist(info->src_addr)) {
      esp_now_peer_info_t peer = {};
      memcpy(peer.peer_addr, info->src_addr, 6);
      peer.channel = 1;
      peer.encrypt = false;
      peer.ifidx = WIFI_IF_STA;
      esp_now_add_peer(&peer);
      enviarLog("Nova Camera detectada!");
    }
    const char *reply = "ACK_CAM";
    esp_now_send(info->src_addr, (uint8_t *)reply, strlen(reply) + 1);
    cameraConectada = true;
    enviarStatus();
  }
}

void setup() {
  Serial.begin(921600);
  
  // Fixar canal WiFi aumenta estabilidade no ESP-NOW
  WiFi.mode(WIFI_STA);
  WiFi.setChannel(1); 
  WiFi.disconnect();
  
  if (esp_now_init() != ESP_OK) {
    enviarLog("ERRO: Falha ao iniciar ESP-NOW");
    ESP.restart();
  }
  
  esp_now_register_recv_cb(OnDataRecv);
  pref.begin("seav_rec", false);

  // Registro do Peer de Broadcast
  uint8_t broadcastMac[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
  esp_now_peer_info_t bPeer = {};
  memcpy(bPeer.peer_addr, broadcastMac, 6);
  bPeer.channel = 1; bPeer.encrypt = false; bPeer.ifidx = WIFI_IF_STA;
  esp_now_add_peer(&bPeer);

  if (pref.getBytes("macCtrl", macControladora, 6) > 0) {
    ctrlPareada = true;
    controladoraConectada = true;
    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, macControladora, 6);
    peer.channel = 1; peer.encrypt = false; peer.ifidx = WIFI_IF_STA;
    esp_now_add_peer(&peer);
    enviarLog("Controladora carregada da memoria.");
  }
  
  enviarLog("Receptor Online no Canal 1");
  enviarStatus();
}

void loop() {
  // Loop de status simplificado
  static unsigned long lastStatus = 0;
  if (millis() - lastStatus > 5000) {
    lastStatus = millis();
    enviarStatus();
  }

  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    input.trim();

    if (ctrlPareada) {
      ControlPacket cp;
      if (input.startsWith("OPEN")) {
        strcpy(cp.comando, "ABRIR");
        cp.tempo = input.substring(5).toInt();
        esp_now_send(macControladora, (uint8_t *)&cp, sizeof(ControlPacket));
        enviarLog("Comando ABRIR enviado.");
      } else if (input.startsWith("CLOSE")) {
        strcpy(cp.comando, "FECHAR");
        cp.tempo = input.substring(6).toInt();
        esp_now_send(macControladora, (uint8_t *)&cp, sizeof(ControlPacket));
        enviarLog("Comando FECHAR enviado.");
      }
    }
  }
}