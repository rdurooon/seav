#include <esp_now.h>
#include <WiFi.h>

#define MAX_PAYLOAD_SIZE 235
#define MAX_IMAGE_SIZE 40000

// COLOQUE AQUI O MAC DO CONTROLADOR (PORTÃO)
uint8_t macControlador[] = {0xF0, 0x24, 0xF9, 0x0E, 0x5B, 0xC8}; 

uint8_t frame_buffer[MAX_IMAGE_SIZE];
uint16_t current_frame_id = 0;
uint16_t chunks_received = 0;

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

void OnDataRecv(const esp_now_recv_info *info, const uint8_t *incomingData, int len) {
  // Se o tamanho for do pacote de imagem
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
  } 
  // Se for o Discovery da Câmera
  else if (strstr((char*)incomingData, "DISCOVERY")) {
    esp_now_peer_info_t peer = {};
    memcpy(peer.peer_addr, info->src_addr, 6);
    peer.channel = 0; peer.encrypt = false; peer.ifidx = WIFI_IF_STA;
    if (!esp_now_is_peer_exist(info->src_addr)) esp_now_add_peer(&peer);
    
    const char *reply = "ACK_PAREAR";
    esp_now_send(info->src_addr, (uint8_t *)reply, strlen(reply) + 1);
  }
}

void setup() {
  Serial.begin(921600); // Baud rate alto para o vídeo
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();

  if (esp_now_init() != ESP_OK) ESP.restart();
  esp_now_register_recv_cb(OnDataRecv);

  // Adiciona o Portão como peer para podermos enviar comandos
  esp_now_peer_info_t peerControl = {};
  memcpy(peerControl.peer_addr, macControlador, 6);
  peerControl.channel = 0; peerControl.encrypt = false; peerControl.ifidx = WIFI_IF_STA;
  esp_now_add_peer(&peerControl);
}

void loop() {
  // Comando do Python: "OPEN 5" ou "CLOSE 5"
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');
    ControlPacket cp;
    if (input.startsWith("OPEN")) {
      strcpy(cp.comando, "ABRIR");
      cp.tempo = input.substring(5).toInt();
      esp_now_send(macControlador, (uint8_t *)&cp, sizeof(ControlPacket));
    } else if (input.startsWith("CLOSE")) {
      strcpy(cp.comando, "FECHAR");
      cp.tempo = input.substring(6).toInt();
      esp_now_send(macControlador, (uint8_t *)&cp, sizeof(ControlPacket));
    }
  }
}