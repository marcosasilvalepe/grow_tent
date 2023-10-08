"use strict";

const mysql = require('mysql');

//DELETE AFTERWARS -> MULTIPLE STATEMENTS LEADS TO SQL INJECTION!!!!
const conn = mysql.createPool({ 
    connectionLimit: 15, 
    host: "localhost", 
    user: "root", 
    password: "password", 
    database: "grow"
});


const get_lights_off_data = () => {
    return new Promise((resolve, reject) => {
        conn.query(`
            SELECT lights_off_min_temp AS min_temp, lights_off_min_humidity AS min_humidity 
            FROM cron_job_tent_values;
        `, (error, results, fields) => {
            if (error) return reject(error);
            return resolve(results[0]);
        })
    })
}

const get_lights_on_data = () => {
    return new Promise((resolve, reject) => {
        conn.query(`
            SELECT min_temp, min_humidity FROM tent_preferences;
        `, (error, results, fields) => {
            if (error) return reject(error);
            return resolve(results[0]);
        })
    })
}

const save_lights_on_data = data => {
    return new Promise((resolve, reject) => {
        conn.query(`
            UPDATE cron_job_tent_values
            SET 
                lights_on_min_temp=${data.min_temp},
                lights_on_min_humidity=${data.min_humidity}
            ;
        `, (error, results, fields) => {
            if (error) return reject(error);
            return resolve();
        })
    })
}

const get_lights_on_saved_data = () => {
    return new Promise((resolve, reject) => {
        conn.query(`
            SELECT lights_on_min_temp AS min_temp, lights_on_min_humidity AS min_humidity
            FROM cron_job_tent_values;
        `, (error, results, fields) => {
            if (error) return reject(error);
            return resolve(results[0]);
        })
    })
}

const save_data = data => {
    return new Promise((resolve, reject) => {
        conn.query(`
            UPDATE tent_preferences
            SET
                min_temp=${data.min_temp},
                min_humidity=${data.min_humidity}
            ;
        `, (error, results, fields) => {
            if (error) return reject(error);
            return resolve();
        })
    })
}

const dont_use_heaters = () => {
    return new Promise((resolve, reject) => {
        conn.query(`
            UPDATE relays SET use_relay=0 WHERE name LIKE 'heater%';
        `, (error, results, fields) => {
            if (error) return reject(error);
            return resolve();
        })
    })
}

(async () => {
    try {

        const this_hour = new Date().getHours();

        const data = {}

        //GET DATA FOR LIGHTS OFF
        if (this_hour === 13) {

            //STORE CURRENT MIN TEMP AND MIN HUMIDITY IN TENT PREFERENCES TO USE WHEN THE LIGHTS TURN ON
            data.lights_on = await get_lights_on_data();
            await save_lights_on_data(data.lights_on);

            //GET VALUES TO USE ON LIGHTS OFF
            data.lights_off = await get_lights_off_data();
            data.target_values = data.lights_off;
            
        }

        //GET DATA FOR LIGHTS ON
        else data.target_values = await get_lights_on_saved_data();
            
        await save_data(data.target_values);

    }
    catch(e) { console.log(e) }
    finally { process.exit() }
})();
