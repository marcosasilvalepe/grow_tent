const express = require('express');
const morgan = require('morgan');

const path = require('path');
const axios = require('axios');
const app = express();

const dotenv = require('dotenv');
dotenv.config({ path: './config/config.env' })

const conn = require('./config/db');
const engine = require('express-handlebars').engine;

if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
    console.log('Using Morgan!');
}

app.use(express.json());

// Handlebars
app.engine('.hbs', engine({ defaultLayout: 'main', extname: '.hbs' }));
app.set('view engine', '.hbs');

// STATIC FOLDER
app.use(express.static(path.join(__dirname, 'public')));

// ROUTES -> NEEDS TO BE AFTER MORGAN
const { router, io, get_devices, save_response, send_whatsapp, get_tent_preferences } = require('./endpoints');
app.use('/', router);

const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV} mode in port ${PORT} - MYSQL Status is: ${conn.state}`);
});

io.on("connection", socket => {

    socket.on('user connected', msg => console.log(msg));

    socket.on('get devices status', async () => {

        const response = { success: false }
        try {

            const get_last_records = () => {
                return new Promise((resolve, reject) => {
                    conn.query(`
                        SELECT id, date, temperature, humidity FROM tent ORDER BY id DESC LIMIT 12;
                    `, (error, results, fields) => {
                        if (error) return reject(error);
                        return resolve(results);
                    })
                })
            }

            const get_devices_sleep_values = () => {
                return new Promise((resolve, reject) => {
                    conn.query(`
                        SELECT sleep_time FROM modules ORDER BY id ASC;
                    `, (error, results, fields) => {
                        if (error) return reject(error);
                        return resolve({
                            temperature: results[0].sleep_time,
                            water_pump: results[1].sleep_time
                        });
                    })
                })
            }
    
            response.devices = await get_devices();
            response.last_records = await get_last_records();
            response.sleep_values = await get_devices_sleep_values();
            response.tent_preferences = await get_tent_preferences();
            response.success = true;
        }
        catch(e) { response.error = e }
        finally { socket.emit('devices status updated', response); }
    });

    socket.on('control relay from browser', async data => {

        const response = {
            device: data.device,
            success: false
        }

        try {

            const devices = await get_devices();

            const mcu_request = await axios({
                method: 'POST',
                url: 'http://192.168.0.77',
                data,
                insecureHTTPParser: true
            });

            const mcu_response = mcu_request.data;

            //console.log('response received from mcu!!!')
            console.log('mcu response is\r\n', mcu_response, '\r\n\r\n');
            
            await save_response(devices, mcu_response);
            response.mcu_data = mcu_response;
            response.success = true;

        }
        catch(e) { response.error = e }
        finally { socket.emit('received response from mcu', response) }
    });

    socket.on('change module sleep time', async module => {

        const response = { success: false }

        try {

            const save_sleep_time = () => {
                return new Promise((resolve, reject) => {
                    conn.query(`
                        UPDATE modules SET sleep_time=${parseInt(module.sleep_value)} WHERE module=${conn.escape(module.name)};
                    `, (error, results, fields) => {
                        if (error) return reject(error);
                        return resolve();
                    })
                })
            }
    
            if (module.name === 'relays') {
                
                const
                ip = 'http://192.168.0.77',
                data = { water_pump_sleep_time: parseInt(module.sleep_value) },
                mcu_request = await axios({
                    method: 'POST',
                    url: ip,
                    data,
                    insecureHTTPParser: true
                }),
                mcu_response = await mcu_request.json();

                console.log(mcu_response);
    
            }

            await save_sleep_time();
            response.module = module;
            response.success = true;
            
        }
        catch(e) { response.error = e }
        finally { io.sockets.emit('module sleep time changed', response) }
    });

    socket.on('change use relay option', async data => {

        const response = { success: false }

        console.log(data)
        
        try {

            const change_use_relay_status = () => {
                return new Promise((resolve, reject) => {
                    conn.query(`
                        UPDATE relays 
                        SET use_relay=${(data.new_status) ? 1 : 0} 
                        WHERE name=${conn.escape(data.relay_name)};
                    `, (error, results, fields) => {
                        if (error) return reject(error);
                        return resolve();
                    })
                })
            }

            await change_use_relay_status();
            response.relay_name = data.relay_name;
            response.new_status = data.new_status;
            response.success = true;
        }
        catch(e) { response.error = e }
        finally { io.sockets.emit('use relay option changed', response) }
    });

    socket.on('change tent preference', async data => {

        const response = { success: false }

        try {

            const save_value = () => {
                return new Promise((resolve, reject) => {
                    conn.query(`
                        UPDATE tent_preferences SET ${data.field}=${parseFloat(data.value)};
                    `, (error, results, fields) => {
                        if (error) return reject(error);
                        return resolve();
                    })
                })
            }

            await save_value();
            response.new_data = data;
            response.success = true;

        }
        catch(e) { console.log(e); response.error = e }
        finally { io.sockets.emit('tent preferences changed', response) }
    });

})

const whatsapp_messenger = {
    last_update_counter: 0,
    max_values_counter: 0
}

if (process.env.NODE_ENV === 'production') {
    setInterval(async () => {
        try {
    
            const check_last_record = () => {
                return new Promise((resolve, reject) => {
                    conn.query(`
                        SELECT date, temperature, humidity 
                        FROM tent ORDER BY id DESC LIMIT 1;
                    `, (error, results, fields) => {
                        if (error || results.length === 0) return reject(error);
                        return resolve({
                            date: new Date(results[0].date),
                            temperature: results[0].temperature,
                            humidity: results[0].humidity
                        });
                    })
                })
            }
          
            const 
            now = new Date(),
            last_record = await check_last_record();
    
            if (((now - last_record) / 1000) > 300 && whatsapp_messenger.last_update_counter < 3) {
                await send_whatsapp('No data from temp module has been updated in 5 minutes!!');
                whatsapp_messenger.last_update_counter++;
            }
            else whatsapp_messenger.last_update_counter = 0;

            
            if (last_record.temperature > 27 || last_record.humidity > 75) {
                if (whatsapp_messenger.max_values_counter < 3) {
                    await send_whatsapp(`Temperature is ${last_record.temperature} and Humidity is ${last_record.humidity}.\r\nThe sensor might have gone bad...`);
                    whatsapp_messenger.max_values_counter++;
                }
            }
            else whatsapp_messenger.max_values_counter = 0;

        }
        catch(e) { console.log(e) }
    }, 60000);
}