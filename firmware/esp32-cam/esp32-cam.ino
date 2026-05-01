#include "esp_camera.h"
#include <esp_now.h>
#include <WiFi.h>
#include <Preferences.h>

// ===========================
// PINOS DA CÂMERA (AI-THINKER)
// ===========================
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

// ===========================
// CONFIGURAÇÕES GERAIS
// ===========================
Preferences pref;
uint8_t targetMac[6];
uint8_t broadcastMac[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
bool pareado = false;
int framesPular = 20; 
int falhasConsecutivas = 0;
const int MAX_FALHAS = 50;

#define MAX_PAYLOAD_SIZE 235

typedef struct {
  uint16_t frame_id;
  uint16_t total_chunks;
  uint16_t chunk_index;
  uint16_t payload_len;
  uint8_t payload[MAX_PAYLOAD_SIZE];
} DataPacket;

DataPacket packet;

void OnDataSent(const uint8_t *mac_addr, esp_now_send_status_t status) {
  if (status != ESP_NOW_SEND_SUCCESS) falhasConsecutivas++;
  else falhasConsecutivas = 0;
}

void OnDataRecv(const esp_now_recv_info *info, const uint8_t *incomingData, int len) {
  if (len < 15 && strstr((char*)incomingData, "ACK_PAREAR")) {
    memcpy(targetMac, info->src_addr, 6);
    pref.putBytes("mac", targetMac, 6);
    Serial.println("\n[LOG] Receptor Pareado! Reiniciando...");
    delay(500);
    ESP.restart();
  }
}

void setup() {
  Serial.begin(115200);
  
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  
  // ULTRA ESTABILIDADE: 6MHz para evitar corrupção por ruído elétrico
  config.xclk_freq_hz = 6000000; 
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode = CAMERA_GRAB_LATEST;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  
  // QUALIDADE BAIXA = ESTABILIDADE ALTA
  config.jpeg_quality = 25; 
  config.fb_count = 1; // Força processamento serial para evitar conflito de memória

  config.frame_size = FRAMESIZE_CIF;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    ESP.restart();
  }

  sensor_t * s = esp_camera_sensor_get();
  s->set_contrast(s, 2);    
  s->set_sharpness(s, 2);   
  // Desativando o AGC agressivo para evitar mudanças bruscas de luz que aumentam o tamanho do frame
  s->set_gain_ctrl(s, 0);   
  s->set_agc_gain(s, 5);    

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();

  pref.begin("automac", false);
  if (pref.getBytes("mac", targetMac, 6) > 0) {
    pareado = true;
  }

  if (esp_now_init() != ESP_OK) ESP.restart();
  esp_now_register_send_cb(esp_now_send_cb_t(OnDataSent));
  esp_now_register_recv_cb(esp_now_recv_cb_t(OnDataRecv));

  esp_now_peer_info_t peerInfo = {};
  memcpy(peerInfo.peer_addr, pareado ? targetMac : broadcastMac, 6);
  peerInfo.channel = 0;  
  peerInfo.encrypt = false;
  peerInfo.ifidx = WIFI_IF_STA;
  esp_now_add_peer(&peerInfo);
}

void loop() {
  if (pareado && falhasConsecutivas >= MAX_FALHAS) {
    pref.clear();
    ESP.restart();
  }

  if (!pareado) {
    const char *msg = "DISCOVERY";
    esp_now_send(broadcastMac, (uint8_t *)msg, strlen(msg) + 1);
    delay(2000);
  } else {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) return;

    if (framesPular > 0) {
      esp_camera_fb_return(fb);
      framesPular--;
      return;
    }

    uint16_t total_chunks = (fb->len + MAX_PAYLOAD_SIZE - 1) / MAX_PAYLOAD_SIZE;
    uint16_t f_id = (uint16_t)(millis() & 0xFFFF); 

    for (uint16_t i = 0; i < total_chunks; i++) {
      packet.frame_id = f_id;
      packet.total_chunks = total_chunks;
      packet.chunk_index = i;
      size_t offset = i * MAX_PAYLOAD_SIZE;
      packet.payload_len = (fb->len - offset > MAX_PAYLOAD_SIZE) ? MAX_PAYLOAD_SIZE : fb->len - offset;
      memcpy(packet.payload, fb->buf + offset, packet.payload_len);

      esp_now_send(targetMac, (uint8_t *)&packet, sizeof(DataPacket));
      
      // Aumentado levemente para dar tempo do receptor processar o pacote
      delayMicroseconds(4000); 
    }

    esp_camera_fb_return(fb);
    // Pequena pausa entre frames para resfriar o rádio
    delay(20); 
  }
}