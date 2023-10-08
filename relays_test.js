const axios = require('axios');
const conn = require('./config/db');

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

        const get_devices = () => {
            return new Promise((resolve, reject) => {
                conn.query(`
                    SELECT * FROM relays ORDER BY id ASC;
                `, (error, results, fields) => {
                    if (error) return reject(error);
                    return resolve([
                        {
                            name: 'humidifier',
                            use_relay: (results[0].use_relay === 1) ? true : false,
                            device_on: results[0].device_on,
                            time_on: results[0].time_on,
                            time_off: results[0].time_off,
                            last_change: results[0].last_change
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

        const save_response = response => {
            return new Promise((resolve, reject) => {
                let query;
                if (response.status_change) query = `
                    UPDATE relays 
                    SET 
                        device_on = ${response.on},
                        ${response.status_field_change} = ${response.status_time_difference},
                        last_change = '${response.status_change_date}'
                    WHERE name='${response.name}';
                `;
                else query = `UPDATE relays SET device_on=${response.on} WHERE name='${response.name}';`;

                conn.query(query, (error, results, fields) => {
                    if (error) return reject(error);
                    return resolve();
                })
            })
        }

        const data = await get_tent_data();
        if (data.length < 3) return;

        /************** GET AVERAGE TEMP AND HUMIDITY FROM LAST 3 RECORDS ***********/
        let average_temperature = 0, average_humidity = 0;
        for (let i = 0; i < data.length; i++) {
            average_temperature += data[i].temperature;
            average_humidity += data[i].humidity;
        }

        average_temperature = average_temperature / 3;
        average_humidity = average_humidity / 3;

        console.log(`Average temp: ${average_temperature} --- Average humidity: ${average_humidity}`);

        /******************** CHECK RELAY DEVICES LAST TIME ON ***************/
        const 
        tent_preferences = await get_tent_preferences(),
        devices = await get_devices(),
        now = new Date(),
        request = {
            water_pump_sleep_time: tent_preferences.water_pump_sleep_time,
            update_script: (tent_preferences.update_script === 1) ? true : false
        };

        if (tent_preferences.use_relays === 1) {

            const 
            heater_1 = devices[2],
            heater_2 = devices[3];

            //HEATER CAN BE USED ONLY IT HAS BEEN INACTIVE FOR MORE THAN 10 MINUTES
            heater_1.time_off = Math.floor(now - new Date(heater_1.last_change));
            heater_1.allowed = (heater_1.time_off > (1000 * 60 * 10) && heater_1.use_relay) ? true : false;

            heater_2.time_off = Math.floor(now - new Date(heater_2.last_change));
            heater_2.allowed = (heater_2.time_off > (1000 * 60 * 10) && heater_2.use_relay) ? true : false;

            /********** TEMPERATURE BELOW MINIMUM ***********/
            if (average_temperature < tent_preferences.min_temp) {
                
                //HEATER 1 CAN BE USED
                if (heater_1.allowed && !heater_2.allowed && heater_2.device_on === 0)
                    request.toggle_heaters = true;

                //HEATER 2 CAN BE USED
                else if (!heater_1.allowed && heater_1.device_on && heater_2.allowed)
                    request.toggle_heaters = true;

                //BOTH HEATERS HAVE BEEN ACTIVE FOR MORE THAN 10 MINUTES
                else if (heater_1.allowed && heater_2.allowed)
                    request.toggle_heaters = true;
            }

            //TURN OFF HEATERS IF TEMPERATURE IS ABOVE MAXIMUM
            else if (average_temperature > tent_preferences.max_temp) 
                request.heater_off = true;

                
            /********** HUMIDITY BELOW MINIMUM ***********/
            if (average_humidity < tent_preferences.min_humidity) {
                request.spray_water = true;
                request.humidify_tent = true;
            }
            else if (average_humidity > tent_preferences.max_humidity) request.humidify_tent = false;
        }

        console.log(request);
        
        //SEND REQUEST TO MICROCONTROLLER
        const raw_response = await axios({
            method: 'POST',
            url: 'http://192.168.0.77',
            data: request,
            insecureHTTPParser: true
        });

        const response = raw_response.data;

        for (let i = 0; i < response.length; i++) {
            for (let j = 0; j < devices.length; j++) {

                if (devices[j].name !== response[i].name) continue;
                
                //STATUS CHANGED FOR DEVICE
                if (devices[j].device_on !== response[i].on) {
                    response[i].status_change = true;
                    response[i].status_change_date = format_date(new Date());
                    response[i].status_field_change = (response[i].on === 1) ? 'time_off' : 'time_on';
                    response[i].status_time_difference = Math.floor((new Date() - new Date(devices[j].last_change)) / 1000);
                }

                else response[i].status_change = false;

            }
        }

        console.log(response);

        for (let i = 0; i < response.length; i++) {
            await save_response(response[i]);
        }

    } catch(e) { console.log(e) }
}

(async () => {
    try {
        analyze_sensor_data();
    } 
    catch(e) { console.log(e) }
})()