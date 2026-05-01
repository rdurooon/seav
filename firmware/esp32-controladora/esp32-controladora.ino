#include <esp_now.h>
#include <WiFi.h>

// Pinos do Driver ULN2003AN
const int IN1 = 13;
const int IN2 = 12;
const int IN3 = 14;
const int IN4 = 27;

// Ajuste de velocidade: quanto MAIOR o número, MAIS LENTO e com MAIS TORQUE.
// Se ainda vibrar, aumente para 1500 ou 2000.
int velocidade = 1200; 

typedef struct {
  char comando[10]; 
  int tempo;       
} ControlPacket;

ControlPacket incomingCommand;

void moverMotor(bool abrir, int segundos) {
  unsigned long startTime = millis();
  
  // Sequência de 8 passos (Half-Step) - Aumenta o torque e evita vibração travada
  int passos[8][4] = {
    {1, 0, 0, 0},
    {1, 1, 0, 0},
    {0, 1, 0, 0},
    {0, 1, 1, 0},
    {0, 0, 1, 0},
    {0, 0, 1, 1},
    {0, 0, 0, 1},
    {1, 0, 0, 1}
  };

  Serial.printf("Executando: %s por %d seg\n", abrir ? "ABRINDO" : "FECHANDO", segundos);

  while (millis() - startTime < (segundos * 1000)) {
    for (int i = 0; i < 8; i++) {
      int stepIdx = abrir ? i : (7 - i);
      digitalWrite(IN1, passos[stepIdx][0]);
      digitalWrite(IN2, passos[stepIdx][1]);
      digitalWrite(IN3, passos[stepIdx][2]);
      digitalWrite(IN4, passos[stepIdx][3]);
      delayMicroseconds(velocidade);
    }
  }
  
  // Desliga bobinas para não esquentar o motor e economizar energia
  digitalWrite(IN1, 0); digitalWrite(IN2, 0); digitalWrite(IN3, 0); digitalWrite(IN4, 0);
}

void OnDataRecv(const esp_now_recv_info *info, const uint8_t *incomingData, int len) {
  if (len == sizeof(ControlPacket)) {
    memcpy(&incomingCommand, incomingData, sizeof(incomingCommand));
    if (strcmp(incomingCommand.comando, "ABRIR") == 0) {
      moverMotor(true, incomingCommand.tempo);
    } else if (strcmp(incomingCommand.comando, "FECHAR") == 0) {
      moverMotor(false, incomingCommand.tempo);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
  pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);

  WiFi.mode(WIFI_STA);
  if (esp_now_init() != ESP_OK) ESP.restart();
  esp_now_register_recv_cb(OnDataRecv);
  
  Serial.println("Controlador do Portão (Maquete) Online");
}

void loop() {}