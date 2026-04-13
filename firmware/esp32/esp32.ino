#include <esp_now.h>
#include <WiFi.h>

#define MAX_PAYLOAD_SIZE 235
#define MAX_IMAGE_SIZE 40000

uint8_t frame_buffer[MAX_IMAGE_SIZE];
uint16_t current_frame_id = 0;
uint16_t chunks_received = 0;

unsigned long lastReceiveTime = 0;
const unsigned long timeoutLimit = 6000;
bool transmissorAtivo = false;

typedef struct {
  uint16_t frame_id;
  uint16_t total_chunks;
  uint16_t chunk_index;
  uint16_t payload_len;
  uint8_t payload[MAX_PAYLOAD_SIZE];
} DataPacket;

// Função de Callback ajustada para ESP32 Core 3.x
void OnDataRecv(const esp_now_recv_info *info, const uint8_t *incomingData, int len) {
  lastReceiveTime = millis();

  if (len == sizeof(DataPacket)) {
    transmissorAtivo = true;
    DataPacket *packet = (DataPacket *)incomingData;

    if (packet->frame_id != current_frame_id) {
      current_frame_id = packet->frame_id;
      chunks_received = 0;
      // Limpamos apenas o início para performance
      memset(frame_buffer, 0, 512);
    }

    size_t offset = packet->chunk_index * MAX_PAYLOAD_SIZE;
    if (offset + packet->payload_len <= MAX_IMAGE_SIZE) {
      memcpy(frame_buffer + offset, packet->payload, packet->payload_len);
      chunks_received++;
    }

    // Lógica de finalização: se chegou o último pacote ou todos os pacotes
    if (packet->chunk_index == packet->total_chunks - 1 || chunks_received >= packet->total_chunks) {
      uint32_t final_size = (packet->total_chunks - 1) * MAX_PAYLOAD_SIZE + packet->payload_len;

      if (final_size > MAX_IMAGE_SIZE) final_size = MAX_IMAGE_SIZE;

      // Envia apenas a imagem. Removido o printf de log daqui de dentro.
      Serial.print("START_IMG");
      Serial.write(frame_buffer, final_size);
      Serial.print("END_IMG");

      chunks_received = 0;
    }
  } else {
    char msg[len + 1];
    memcpy(msg, incomingData, len);
    msg[len] = '\0';

    if (strstr(msg, "DISCOVERY")) {
      // REGISTRO DINÂMICO DO TRANSMISSOR COMO PEER
      if (!esp_now_is_peer_exist(info->src_addr)) {
        esp_now_peer_info_t peerInfo = {};
        memcpy(peerInfo.peer_addr, info->src_addr, 6);
        peerInfo.channel = 0;
        peerInfo.encrypt = false;
        peerInfo.ifidx = WIFI_IF_STA;
        esp_now_add_peer(&peerInfo);
      }

      const char *reply = "ACK_PAREAR";
      esp_now_send(info->src_addr, (uint8_t *)reply, strlen(reply) + 1);
      Serial.println("LOG:[PAREAMENTO] Transmissor detectado e ACK enviado.");
    }
  }
}

void setup() {
  Serial.begin(921600);

  // Aguarda Serial estabilizar
  delay(1000);

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();

  if (esp_now_init() != ESP_OK) {
    Serial.println("LOG:Erro ao iniciar ESP-NOW");
    ESP.restart();
  }

  // CORREÇÃO AQUI: Removido o 'e' extra e o cast desnecessário
  esp_now_register_recv_cb(OnDataRecv);

  Serial.println("LOG:--- RECEPTOR ONLINE E AGUARDANDO ---");
}

void loop() {
  if (transmissorAtivo && (millis() - lastReceiveTime > timeoutLimit)) {
    Serial.println("LOG:[WATCHDOG] Conexão com transmissor perdida.");
    transmissorAtivo = false;
    current_frame_id = 0;
  }
}