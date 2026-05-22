#include <esp_now.h>
#include <WiFi.h>
#include <Preferences.h>

// Pinos do Motor
const int IN1 = 13, IN2 = 12, IN3 = 14, IN4 = 27;
int velocidade = 1200;

// PINOS DO SENSOR ULTRASSÔNICO (Adicionados)
const int PIN_TRIG = 25;
const int PIN_ECHO = 26;
const int DISTANCIA_DETECCAO_CM = 10; // Distância limite para detectar o carrinho na maquete

Preferences pref;
uint8_t targetMac[6];
uint8_t broadcastMac[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
bool pareado = false;
unsigned long lastPing = 0;

typedef struct { char comando[10]; int tempo; } ControlPacket;
volatile ControlPacket cmdGlobal;
volatile bool novoCmd = false;

// Máquina de Estados Expandida
enum Estado { PARADO, ABRINDO, AGUARDANDO_PASSAGEM, VEICULO_PASSANDO, FECHANDO };
Estado estadoAtual = PARADO;

unsigned long tempoInicioMovimento = 0;
unsigned long tempoAproximacaoSaida = 0; // Temporizador para o Cenário 2
bool veiculoDetectadoNaSaida = false;

// Função para ler o sensor ultrassônico
float lerDistanciaCM() {
  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  
  long duracao = pulseIn(PIN_ECHO, HIGH, 30000); // Timeout de 30ms para não travar o código
  if (duracao == 0) return 999.0; // Sem eco (objeto muito longe)
  
  return (duracao * 0.0343) / 2;
}

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
    lastPing = millis();
  } 
  else if (len == sizeof(ControlPacket)) {
    memcpy((void*)&cmdGlobal, (void*)incomingData, sizeof(ControlPacket));
    novoCmd = true;
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
  
  // Configuração dos pinos do Ultrassônico
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  
  desligarMotor();

  WiFi.mode(WIFI_STA);
  WiFi.setChannel(1);
  WiFi.disconnect();

  if (esp_now_init() != ESP_OK) ESP.restart();
  esp_now_register_recv_cb(OnDataRecv);

  esp_now_peer_info_t bPeer = {};
  memcpy(bPeer.peer_addr, broadcastMac, 6);
  bPeer.channel = 1; bPeer.encrypt = false; bPeer.ifidx = WIFI_IF_STA;
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
  if (!pareado || (millis() - lastPing > 10000)) {
    const char *msg = "DISC_CTRL";
    esp_now_send(broadcastMac, (uint8_t *)msg, strlen(msg) + 1);
    Serial.println("Tentando reconexão...");
    delay(2000);
    return;
  }

  if (millis() - lastPing > 5000) {
     const char *ping = "PING";
     esp_now_send(targetMac, (uint8_t *)ping, strlen(ping) + 1);
  }

  float distancia = lerDistanciaCM();

  // ==========================================
  // CENÁRIO 2: MONITORAMENTO DE SAÍDA (PORTÃO FECHADO)
  // ==========================================
  if (estadoAtual == PARADO) {
    if (distancia < DISTANCIA_DETECCAO_CM) {
      if (!veiculoDetectadoNaSaida) {
        veiculoDetectadoNaSaida = true;
        tempoAproximacaoSaida = millis(); // Inicia contagem dos 3 segundos
      } else if (millis() - tempoAproximacaoSaida >= 3000) {
        // Carro parado há 3 segundos. Simula recepção de comando de abertura externa
        cmdGlobal.tempo = 5; // Tempo padrão de abertura da maquete
        strcpy((char*)cmdGlobal.comando, "ABRIR");
        novoCmd = true; 
        veiculoDetectadoNaSaida = false;
      }
    } else {
      veiculoDetectadoNaSaida = false; // Reset se o carro se afastar antes dos 3s
    }
  }

  // ==========================================
  // PROCESSAMENTO DE COMANDOS / MOVIMENTAÇÃO
  // ==========================================
  if (novoCmd) {
    novoCmd = false;
    String acao = String((char*)cmdGlobal.comando);
    int tempoAlvoMS = cmdGlobal.tempo * 1000;

    if (acao == "ABRIR") {
      estadoAtual = ABRINDO;
      tempoInicioMovimento = millis();
      unsigned long fim = millis() + tempoAlvoMS;

      // Executa abertura completa
      while (millis() < fim && !novoCmd) {
        for (int i = 0; i < 8 && !novoCmd; i++) {
          moverPasso(i);
        }
      }
      desligarMotor();
      
      // Mudança crítica: Ao terminar de abrir, NÃO vai para PARADO.
      // Vai aguardar o carro passar (Cenário 1)
      if (!novoCmd) estadoAtual = AGUARDANDO_PASSAGEM;
    } 
    else if (acao == "FECHAR") {
      estadoAtual = FECHANDO;
      unsigned long fim = millis() + tempoAlvoMS;
      while (millis() < fim && !novoCmd) {
        for (int i = 0; i < 8 && !novoCmd; i++) {
          moverPasso(7 - i);
        }
      }
      desligarMotor();
      if (!novoCmd) estadoAtual = PARADO;
    }
  }

  // ==========================================
  // CENÁRIO 1: LÓGICA DE ESPERA E FECHAMENTO AUTOMÁTICO
  // ==========================================
  if (estadoAtual == AGUARDANDO_PASSAGEM) {
    // Aguarda o carro entrar no raio do sensor
    if (distancia < DISTANCIA_DETECCAO_CM) {
      estadoAtual = VEICULO_PASSANDO;
    }
  }

  if (estadoAtual == VEICULO_PASSANDO) {
    // O carro já foi detectado, agora aguarda ele SAIR do raio do sensor
    if (distancia > DISTANCIA_DETECCAO_CM) {
      // Carro passou! Aciona o fechamento automático.
      cmdGlobal.tempo = 5; // Tempo necessário para fechar
      strcpy((char*)cmdGlobal.comando, "FECHAR");
      novoCmd = true;
    }
  }
}