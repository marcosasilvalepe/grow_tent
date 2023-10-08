"use strict";
const express = require('express');
const axios = require('axios');
const conn = require('./config/db');
const router = express.Router();
const module_identifier = 'KJFHjfs33t4okjg';

/************** WHATSAPP TWILIO STUFF ***********/

const accountSid = 'twilio id';
const authToken = 'twilio token';
const client = require('twilio')(accountSid, authToken);

const send_whatsapp = txt => {
    return new Promise(async (resolve, reject) => {
        try {
            const message = await client.messages.create({
                from: 'whatsapp:+14155238886',
                body: txt,
                to: 'whatsapp:phone_number'
            });
            console.log(message);
            return resolve();
        } catch(e) { return reject(e) }
    })
}

/************** SOCKET SERVER ***********/

const socket_src = (process.env.NODE_ENV === 'development') ? 
    "http://192.168.0.6:5001/socket.io/socket.io.js"
    :
    "http://192.168.0.90:5001/socket.io/socket.io.js"
;

const socket_server = require('http').createServer(express);
const io = require('socket.io')(socket_server, {
    cors: { origin: '*' }
});

socket_server.listen(5001);

let whatsapp_counter = 0;

const delay = ms => { return new Promise(resolve => setTimeout(resolve, ms)) }

const error_handler = error => {
    return new Promise((resolve, reject) => {
        const now = format_date(new Date());
        console.log(error)
        conn.query(`
            INSERT INTO server_errors (error, date) VALUES (${conn.escape(JSON.stringify(error))}, '${now}');
        `, (error, results, fields) => {
            if (error) return reject(error);
            return resolve();
        })
    })
}

const format_date = date => {
    let
    current_date = date.getDate(),
    current_month = date.getMonth() + 1,
    current_year = date.getFullYear(),
    current_hrs = date.getHours(),
    current_mins = date.getMinutes(),
    current_secs = date.getSeconds();

    // Add 0 before date, month, hrs, mins or secs if they are less than 0
    current_date = current_date < 10 ? '0' + current_date : current_date;
    current_month = current_month < 10 ? '0' + current_month : current_month;
    current_hrs = current_hrs < 10 ? '0' + current_hrs : current_hrs;
    current_mins = current_mins < 10 ? '0' + current_mins : current_mins;
    current_secs = current_secs < 10 ? '0' + current_secs : current_secs;

    return current_year + '-' + current_month + '-' + current_date + ' ' + current_hrs + ':' + current_mins + ':' + current_secs;
}

const get_devices = () => {
    return new Promise((resolve, reject) => {
        conn.query(`
            SELECT * FROM relays ORDER BY id ASC;
        `, (error, results, fields) => {
            if (error) return reject(error);
            return resolve([
                {
                    name: 'humidifier_1',
                    use_relay: (results[0].use_relay === 1) ? true : false,
                    device_on: results[0].device_on,
                    time_on: results[0].time_on,
                    time_off: results[0].time_off,
                    last_change: results[0].last_change
                },
                {
                    name: 'humidifier_2',
                    use_relay: (results[4].use_relay === 1) ? true : false,
                    device_on: results[4].device_on,
                    time_on: results[4].time_on,
                    time_off: results[4].time_off,
                    last_change: results[4].last_change
                },
                {
                    name: 'water_pump',
                    use_relay: (results[1].use_relay === 1) ? true : false,
                    device_on: results[1].device_on,
                    time_on: results[1].time_on,
                    time_off: results[1].time_off,
                    last_change: results[1].last_change
                },
                {
                    name: 'heater_1',
                    use_relay: (results[2].use_relay === 1) ? true : false,
                    device_on: results[2].device_on,
                    time_on: results[2].time_on,
                    last_change: results[2].last_change
                },
                {
                    name: 'heater_2',
                    use_relay: (results[3].use_relay === 1) ? true : false,
                    device_on: results[3].device_on,
                    time_on: results[3].time_on,
                    last_change: results[3].last_change
                }
            ]);
        })
    })
}

const insert_into_relay_history = mcu_response => {

    console.log('MCU RESPONSE HERE!!!!\r\n');
    console.log(mcu_response)
    return new Promise((resolve, reject) => {
        conn.query(`
            INSERT INTO relays_history (device_name, date, new_status)
            VALUES (${conn.escape(mcu_response.name)}, '${mcu_response.status_change_date}', ${mcu_response.on});
        `, (error, results, fields) => {
            if (error) return reject(error);
            return resolve();
        })
    })
}

const get_tent_preferences = () => {
    return new Promise((resolve, reject) => {
        conn.query(`
            SELECT * FROM tent_preferences;
        `, (error, results, fields) => {
            if (error) return reject(error);
            return resolve(results[0]);
        })
    })
}

const save_response = (devices, mcu_response) => {
    return new Promise(async (resolve, reject) => {
        try {

            const save_data = data => {
                return new Promise((resolve, reject) => {
                    let query;
                    if (data.status_change) query = `
                        UPDATE relays 
                        SET 
                            device_on = ${data.on},
                            ${data.status_field_change} = ${data.status_time_difference},
                            last_change = '${data.status_change_date}'
                        WHERE name='${data.name}';
                    `;
                    else query = `UPDATE relays SET device_on=${data.on} WHERE name='${data.name}';`;
            
                    conn.query(query, (error, results, fields) => {
                        if (error) return reject(error);
                        return resolve();
                    })
                })
            }

            for (let i = 0; i < mcu_response.length; i++) {
                for (let j = 0; j < devices.length; j++) {
    
                    if (devices[j].name !== mcu_response[i].name) continue;
                    
                    //STATUS CHANGED FOR DEVICE
                    if (devices[j].device_on !== mcu_response[i].on) {
                        
                        mcu_response[i].status_change = true;
                        mcu_response[i].status_change_date = format_date(new Date());
                        mcu_response[i].status_field_change = (mcu_response[i].on === 1) ? 'time_off' : 'time_on';
                        mcu_response[i].status_time_difference = Math.floor((new Date() - new Date(devices[j].last_change)) / 1000);

                        try { insert_into_relay_history(mcu_response[i]) }
                        catch(err) { console.log(err) }     
                        
                    }
    
                    else mcu_response[i].status_change = false;
    
                }
            }
    
            //console.log(mcu_response);
    
            for (let i = 0; i < mcu_response.length; i++) {
                await save_data(mcu_response[i]);
            }

            io.sockets.emit('data from relays mcu updated', mcu_response);
            return resolve();

        } catch(e) { return reject(e) }
    })
}

const analyze_sensor_data = async () => {
    try {

        const get_tent_data = () => {
            return new Promise((resolve, reject) => {
                conn.query(`
                    SELECT temperature, humidity FROM tent ORDER BY id DESC LIMIT 3;
                `, (error, results, fields) => {
                    if (error) return reject(error);
                    return resolve(results);
                })
            })
        }

        const 
        data = await get_tent_data(),
        tent_preferences = await get_tent_preferences();

        //if (data.length < 3) return;
        if (data[0].temperature === 0 || data[0].humidity === 0) return;

        let average_temperature = 0, average_humidity = 0;

        if (data[0].temperature <= tent_preferences.min_temp) {
            average_temperature = data[0].temperature;
            for (let i = 0; i < data.length; i++) { average_humidity += data[i].humidity }
        }

        else {

            /************** GET AVERAGE TEMP AND HUMIDITY FROM LAST 3 RECORDS ***********/
            for (let i = 0; i < data.length; i++) {
                average_temperature += data[i].temperature;
                average_humidity += data[i].humidity;
            }

            average_temperature = average_temperature / 3;
        }

        average_humidity = average_humidity / 3;
        
        console.log(`Average temp: ${average_temperature} --- Average humidity: ${average_humidity}`);

        /******************** CHECK RELAY DEVICES LAST TIME ON ***************/
        const 
        devices = await get_devices(),
        now = new Date(),
        request = {
            water_pump_sleep_time: tent_preferences.water_pump_sleep_time,
            update_script: (tent_preferences.update_script === 1) ? true : false
        };

        if (tent_preferences.use_relays === 0) return;

        const 
        humidifier_1 = devices[0],
        humidifier_2 = devices[1],
        water_pump = devices[2],
        heater_1 = devices[3],
        heater_2 = devices[4];

        //HEATER CAN BE USED ONLY IT HAS BEEN INACTIVE FOR MORE THAN 5 MINUTES
        heater_1.time_off = Math.floor((now - new Date(heater_1.last_change)) / 1000);
        heater_1.allowed = (heater_1.time_off > (60 * 5) && heater_1.use_relay) ? true : false;

        heater_2.time_off = Math.floor((now - new Date(heater_2.last_change)) / 1000);
        heater_2.allowed = (heater_2.time_off > (60 * 5) && heater_2.use_relay) ? true : false;

        if (tent_preferences.hot_weather === 0) {

            /********** TEMPERATURE BELOW MINIMUM ***********/
            if (average_temperature <= tent_preferences.min_temp) {

                /********* BOTH HEATERS ARE OFF *********/
                if (heater_1.device_on === 0 && heater_2.device_on === 0) {

                    //HEATER 1 CAN BE USED
                    if (heater_1.allowed && !heater_2.allowed) {
                        //request.toggle_heaters = true;                    
                        request.heater_on = true;
                        request.heater_number = 1;
                    }

                    //HEATER 2 CAN BE USED
                    else if (!heater_1.allowed && heater_2.allowed) {
                        //request.toggle_heaters = true;
                        request.heater_on = true;
                        request.heater_number = 2;
                    }

                    //EITHER ONE OF THE HEATERS CAN BE USED
                    else if (heater_1.allowed && heater_2.allowed) {
                        request.heater_on = true;
                        if (heater_1.time_off > heater_2.time_off) request.heater_number = 1;
                        else request.heater_number = 2;
                    }

                }

            }
                /********** TURN OFF HEATERS IF TEMPERATURE IS ABOVE MINIMUM ***********/
                else request.heater_off = true;
            }


        /********** WEATHER OUTSIDE IS TOO HOT ***********/
        else {

            console.log(`max temp is ${tent_preferences.max_temp}`);

            if (average_temperature >= tent_preferences.max_temp) {
                request.heater_on = true;
                request.heater_number = 1;
            }

            else request.heater_off = true;
        }

            
        /********** HUMIDITY BELOW MINIMUM ***********/
        if (average_humidity < tent_preferences.min_humidity) {

            request.humidifier_on = true;

            if (humidifier_1.use_relay && humidifier_2.use_relay) {

                //BOTH HUMIDIFIERS ARE OFF. TURNING ON NUMBER 2
                if (humidifier_1.device_on === 0 && humidifier_2.device_on === 0)
                    request.humidifier_number = 2;

                //HUMIDIFIER 1 IS ON. TURNING ON NUMBER 2
                else if (humidifier_1.device_on === 1 && humidifier_2.device_on === 0)
                    request.humidifier_number = 2;

                //HUMIDIFER 2 IS ON. TURNING ON NUMBER 1
                else if (humidifier_1.device_on === 0 && humidifier_2.device_on === 1)
                    request.humidifier_number = 1;
            }

            // CAN'T USE NEITHER OF THE HUMIDIFIERS SO PASS
            else if (!humidifier_1.use_relay && !humidifier_2.use_relay) {
                
            }

            // CAN USE ONE OR THE OTHER
            else {

                console.log('INSIDE CAN USE EITHER HUMIDIFER!\r\n');
                if (humidifier_1.use_relay) request.humidifier_number = 1;
                else if (humidifier_2.use_relay) request.humidifier_number = 2;
            }

            if (water_pump.use_relay) request.spray_water = true;

        }

        /********** HUMIDITY ABOVE MINIMUM ***********/
        else {

            request.humidifier_on = false;

            //BOTH HUMIDIFIERS ARE ON. TURN OFF NUMBER 1
            if (humidifier_1.device_on === 1 && humidifier_2.device_on === 1)
                request.humidifier_number = 1;
            
            //HUMIDIFIER 1 IS ON
            else if (humidifier_1.device_on === 1 && humidifier_2.device_on === 0) 
                request.humidifier_number = 1;

            //HUMIDIFER 2 IS ON
            else if (humidifier_1.device_on === 0 && humidifier_2.device_on === 1)
                request.humidifier_number = 2;

        }
            
        console.log('request to mcu controlling the relays is:\r\n', request, '\r\n\r\n');
        
        //SEND REQUEST TO MICROCONTROLLER
        const mcu_request = await axios({
            method: 'POST',
            url: 'http://192.168.0.77',
            data: request,
            insecureHTTPParser: true
        });

        const response = mcu_request.data;

        await save_response(devices, response);
        

    } catch(e) { console.log(e) }
}

router.get('/', async (req, res) => {
    try {

        const get_file_versions = () => {
            return new Promise((resolve, reject) => {
                conn.query(`
                    SELECT * FROM file_versions ORDER BY id ASC;
                `, (error, results, fields) => {
                    if (error || results.length === 0) return reject(error);
                    return resolve({
                        css: results[0].version,
                        js: results[1].version
                    })
                })
            })
        }

        const file_versions = await get_file_versions();

        res.render('home', {
            title: 'GT',
            css: [
                { 
                    path: `css/main.css?v=${file_versions.css}`,
                    attributes: [{ attr: 'type', value: 'text/css' }]
                },
                { 
                    path: 'fontawesome/css/all.css',
                    attributes: [{ attr: 'type', value: 'text/css' }]
                }
            ],
            script: [
                { 
                    src: socket_src,
                    attributes: ["defer"]
                },
                {
                    src: `js/main.js?v=${file_versions.js}`,
                    attributes: ["defer"]
                }
            ]
        })    
    }
    catch(e) { error_handler(e) }
})

router.post('/module_start', async (req, res) => {

    const 
    response = { success: false },
    { identifier, module, script_version, sleep_time } = req.body,
    temp = {},
    now = format_date(new Date());

    try {

        const save_data = () => {
            return new Promise((resolve, reject) => {
                conn.query(`
                    INSERT INTO module_start (date, module, version)
                    VALUES (
                        '${now}',
                        '${module}',
                        ${parseFloat(script_version)}
                    );
                `, (error, results, fields) => {
                    if (error) return reject(error);
                    return resolve();
                })
            })
        }

        const save_sleep_time = () => {
            return new Promise((resolve, reject) => {
                conn.query(`
                    UPDATE modules 
                    SET 
                        sleep_time=${parseInt(sleep_time)},
                        reset=0
                    WHERE module='${module}';
                `, (error, results, fields) => {
                    if (error) return reject(error);
                    return resolve();
                })
            })
        }

        const reset_relay_values = () => {
            return new Promise((resolve, reject) => {
                conn.query(`
                    UPDATE relays 
                    SET 
                        device_on=0,
                        time_on=0,
                        time_off=0
                    ;
                `, (error, results, fields) => {
                    if (error) return reject(error);
                    return resolve();
                })
            })
        }

        if (identifier === module_identifier) {
            
            await save_data();
            
            if (module === 'relays') await reset_relay_values();
            else await save_sleep_time();

            response.success = true;    
        }

    }
    catch(e) { error_handler(e) }
    finally { res.json(response) }
})

router.post('/error_post', async (req, res) => {

    const
    response = { success: false },
    { identifier, module, script_version, func, error } = req.body,
    now = format_date(new Date());

    try {

        const save_error = () => {
            return new Promise((resolve, reject) => {
                conn.query(`
                    INSERT INTO module_errors (date, module, script_version, func, error)
                    VALUES (
                        '${now}',
                        '${module}',
                        ${parseFloat(script_version)},
                        '${func}',
                        '${error}'
                    );
                `, (error, results, fields) => {
                    if (error) return reject(error);
                    return resolve();
                })
            })
        }

        if (identifier === module_identifier) {
            await save_error();
            response.success = true;
        }

    }
    catch(e) { error_handler(e) }
    finally { res.json(response) }
})

router.post('/sensor_post', async (req, res) => {

    const
    { identifier, module, script_version, temperature, humidity } = req.body,
    response = { success: false },
    now = format_date(new Date());

    try {

        const save_data = () => {
            return new Promise((resolve, reject) => {
                conn.query(`
                    INSERT INTO tent (date, script_version, temperature, humidity)
                    VALUES (
                        '${now}',
                        ${parseFloat(script_version)},
                        ${parseFloat(temperature)},
                        ${parseFloat(humidity)}
                    );
                `, (error, results, fields) => {
                    if (error) return reject(error);
                    return resolve();
                })
            })
        }

        const check_module_errors = () => {
            return new Promise((resolve, reject) => {
                conn.query(`
                    SELECT temperature, humidity FROM tent ORDER BY id DESC LIMIT 7;
                `, (error, results, fields) => {
                    if (error) return reject(error);

                    let 
                    temp = results[0].temperature, 
                    humidity = results[0].humidity,
                    module_error = true;

                    for (let row of results) {
                        if (row.temperature !== temp || row.humidity !== humidity) {
                            module_error = false;
                            break
                        }
                        else continue;
                    }

                    return resolve(module_error);
                })
            })
        }

        const get_module_preferences = () => {
            return new Promise((resolve, reject) => {
                conn.query(`
                    SELECT sleep_time, script_version, reset FROM modules WHERE module='${module}';
                `, (error, results, fields) => {
                    if (error) return reject(error);
                    response.sleep_time = results[0].sleep_time;
                    response.script_version = results[0].script_version;
                    response.reset = (results[0].reset === 1) ? true : false;
                    return resolve();
                })
            })
        }

        if (identifier === module_identifier) {
            
            await save_data();
            await get_module_preferences();

            //CHECK LAST 6 RECORDS AND IF ALL ARE THE SAME THEN RESET MODULE
            if (!response.reset) response.reset = await check_module_errors();

            response.success = true;

            io.sockets.emit('new data from temperature sensor', { now, temperature, humidity });

            if (parseFloat(temperature) < 20) {
                if (whatsapp_counter < 3) {
                    try { 
                        send_whatsapp('Temperature droped below 20!!! X( X( X(');
                        whatsapp_counter++;
                    }
                    catch(err) { console.log(err) }        
                }
            } else whatsapp_counter = 0;
        }
    }
    catch(e) { error_handler(error) }
    finally { 
        res.json(response);
        try { analyze_sensor_data() }
        catch { console.log(e) }
    }
})

router.post('/update_device_status', async (req, res) => {
    
    const 
    { identifier, device, status } = req.body,
    temp = {},
    response = { success: false };

    try {

        const get_device = () => {
            return new Promise((resolve, reject) => {
                conn.query(`
                    SELECT * FROM relays WHERE name='${device}';
                `, (error, results, fields) => {
                    if (error) return reject(error);
                    return resolve(results[0]);
                })
            })
        }

        const update_device_status = () => {
            return new Promise((resolve, reject) => {
                conn.query(`
                    UPDATE relays 
                    SET 
                        device_on=${parseInt(status)},
                        ${temp.status_field_change}=${temp.status_time_difference},
                        last_change='${temp.now}'
                    WHERE name='${device}';
                `, (error, results, fields) => {
                    if (error) return reject(error);
                    return resolve()
                })
            })
        }

        if (identifier === module_identifier) {

            const device_data = await get_device();

            temp.now = format_date(new Date());
            temp.status_field_change = (parseInt(status) === 1) ? 'time_off' : 'time_on';
            temp.status_time_difference = Math.floor((new Date() - new Date(device_data.last_change)) / 1000);

            await update_device_status();
            response.success = true;

            try { io.sockets.emit('device status after timeout', { device, status }) }
            catch(err) { console.log(err) }
        }
    }
    catch(e) { error_handler(e) }
    finally { res.json(response) }
})

router.post('/get_more_records', async (req, res) => {

    const 
    { offset } = req.body,
    response = { success: false };

    try {

        const get_records = () => {
            return new Promise((resolve, reject) => {
                conn.query(`
                    SELECT * FROM tent ORDER BY id DESC LIMIT ${offset + 1}, 500;
                `, (error, results, fields) => {
                    if (error) return reject(error);
                    return resolve(results);
                })
            })
        }

        response.records = await get_records();
        response.success = true;

    }
    catch(e) { response.error = e }
    finally { res.json(response) }
})

router.post('/get_device_history', async (req, res) => {

    const 
    { device } = req.body,
    response = { success: false }

    try {

        const get_data = () => {
            return new Promise((resolve, reject) => {
                conn.query(`
                    SELECT * FROM 
                `, (error, results, fields) => {
                    if (error) return reject(error);
                    return resolve();
                })
            })
        }

        const 
        timestamp = Date.now(),
        yesterday_timestamp = timestamp - (3600 * 24 * 1000),
        yesterday = format_date(new Date(yesterday_timestamp));



    }
    catch(e) { response.error = e }
    finally { res.json(response) }
})

router.post('/relay_switched_off', async (req, res) => {

    const 
    { identifier, device } = req.body,
    response = { success: false },
    now = format_date(new Date());

    try {

        const check_current_status = () => {
            return new Promise((resolve, reject) => {
                conn.query(`
                    SELECT new_status 
                    FROM relays_history 
                    WHERE device_name=${conn.escape(device)}
                    ORDER BY id DESC LIMIT 1;
                `, (error, results, fields) => {
                    if (error || results.length === 0) return reject(error);
                    return resolve(results[0].new_status);
                })
            })
        }

        const insert_data = () => {
            return new Promise((resolve, reject) => {
                conn.query(`
                    INSERT INTO relays_history (device_name, date, new_status)
                    VALUES (${conn.escape(device)}, '${now}', 0);
                `, (error, results, fields) => {
                    if (error) return reject(error);
                    return resolve();
                })
            })
        }

        if (identifier === module_identifier) {

            const last_status = await check_current_status();
            
            if (last_status === 1) {
                await insert_data();
                io.sockets.emit('device in relays mcu switched off', { device, now });
            }

            response.success = true;    
        }

    }
    catch(e) { response.error = e }
    finally { res.json(response) }
})

module.exports = { router, io, get_devices, save_response, send_whatsapp, get_tent_preferences };
