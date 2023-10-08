# Automated Grow Tent

Web app for solid state relays that control humidifiers and heaters to keep ideal humidity and temperature inside a grow tent.
The web app works with a NodeJS, MySQL and Socket.IO backend and Vanilla Javascript in the frontend. Relays are controlled by ESP32 microcontrollers using Micropython. 
Humidity and temperature are meassured using an ESP32 MCU with a DHT22 sensor.
Minimum and maximum values for humidity and temperature are established using the web app and the server automatically turns on or off the humidifiers and heaters in order to keep ideal conditions for plants to grow.
