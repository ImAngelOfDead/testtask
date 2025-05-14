<template>
  <div class="start-panel">
    <div class="panel-content">
      <div class="logo">
        <svg width="80" height="80" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="45" stroke="#42b983" stroke-width="2" fill="none" />
          <path d="M30 50L45 65L70 40" stroke="#42b983" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <h2>Панель управления билдами</h2>
      <p>
        WebSocket сервер ожидает подключения клиентов на порту 443 (HTTPS).
        Нажмите кнопку "Запустить сервер" для начала работы.
      </p>
      
      <div class="info-box">
        <div class="info-icon">ℹ</div>
        <div class="info-content">
          Клиенты должны подключаться с правильным форматом заголовка (32-битное число 2) и идентификатором бота (botId).
          Все команды будут зашифрованы алгоритмом Salsa20.
        </div>
      </div>
      
      <button class="start-button" @click="startServer">
        <span class="button-icon">▶</span>
        Запустить сервер
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'StartPanel',
  methods: {
    startServer() {
      this.$emit('start-server');
    }
  }
};
</script>

<style scoped>
.start-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  background: linear-gradient(135deg, #f5f7fa 0%, #e6e9f0 100%);
}

.panel-content {
  text-align: center;
  max-width: 600px;
  padding: 40px;
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
  animation: fadeIn 0.5s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.logo {
  margin-bottom: 20px;
}

h2 {
  margin-bottom: 20px;
  color: #2c3e50;
  font-size: 28px;
  font-weight: 500;
}

p {
  margin-bottom: 25px;
  color: #666;
  line-height: 1.6;
  font-size: 16px;
}

.info-box {
  display: flex;
  align-items: flex-start;
  background-color: #f8f9fa;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 30px;
  border-left: 4px solid #42b983;
  text-align: left;
}

.info-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  color: #42b983;
  font-size: 18px;
  font-weight: bold;
  margin-right: 10px;
}

.info-content {
  color: #555;
  font-size: 14px;
  line-height: 1.5;
}

.start-button {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 15px 35px;
  font-size: 16px;
  font-weight: 500;
  background-color: #42b983;
  color: white;
  border: none;
  border-radius: 50px;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 10px rgba(66, 185, 131, 0.3);
}

.start-button:hover {
  background-color: #3a9e70;
  transform: translateY(-2px);
  box-shadow: 0 6px 15px rgba(66, 185, 131, 0.4);
}

.start-button:active {
  transform: translateY(1px);
  box-shadow: 0 2px 5px rgba(66, 185, 131, 0.4);
}

.button-icon {
  margin-right: 10px;
  font-size: 14px;
}

@media (max-width: 768px) {
  .panel-content {
    padding: 30px 20px;
    width: 90%;
  }
  
  h2 {
    font-size: 24px;
  }
}

@media (prefers-color-scheme: dark) {
  .start-panel {
    background: linear-gradient(135deg, #2c3e50 0%, #1a2634 100%);
  }
  
  .panel-content {
    background-color: #34495e;
    box-shadow: 0 5px 20px rgba(0, 0, 0, 0.3);
  }
  
  h2 {
    color: #fff;
  }
  
  p {
    color: #ddd;
  }
  
  .info-box {
    background-color: #2c3e50;
    border-left-color: #42b983;
  }
  
  .info-content {
    color: #bbb;
  }
  
  .start-button {
    background-color: #42b983;
  }
  
  .start-button:hover {
    background-color: #3aa876;
  }
}
</style>