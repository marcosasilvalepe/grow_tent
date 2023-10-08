"use strict";

const delay = ms => { return new Promise(resolve => setTimeout(resolve, ms)) }

const error_handler = e => { console.log(e) }

const format_time_difference = difference => {

    let formatted_difference;

    //SECONDS
    if (difference < 60) formatted_difference = difference + 's.';

    //MINUTES
    else if (difference >= 60 && difference <= 3600) {
        const
        minutes = Math.floor(difference / 60),
        seconds = Math.floor(difference - (minutes * 60));
        formatted_difference = `${minutes}m. ${seconds}s.`;
    }

    //HOURS
    else if (difference > 3600 && difference <= 86400) {
        const
        hours = Math.floor(difference / 3600),
        minutes = Math.floor((difference - (hours * 3600)) / 60),
        seconds = Math.floor(difference - (hours * 3600) - (minutes * 60));
        formatted_difference = `${hours}h. ${minutes}m. ${seconds}s.`;
    }

    //DAYS
    else if (difference > 86400) {
        const 
        days = Math.floor(difference / 86400),
        hours = Math.floor((difference - (days * 86400)) / 3600),
        minutes = Math.floor((difference - (hours * 3600) - (days * 86400)) / 60),
        seconds = Math.floor(difference - (minutes * 60) - (hours * 3600) - (days * 86400));

        formatted_difference = `${days}d. ${hours}h. ${minutes}m. ${seconds}s.`;
    }
    return formatted_difference;
}

const socket = io('http://192.168.0.90:5001');

socket.on("connect", () => {

    socket.emit('user connected', 'sdskjdfhjksd')

    socket.emit('get devices status');

    //GETS CALLED ONLY ONCE ON SOCKET CONNECTION!!
    socket.on('devices status updated', response => {

        console.log(response)

        document.getElementById('next-record').setAttribute('data-last-record', new Date(response.last_records[0].date));

        response.devices.forEach(device => {
            if (device.device_on === 1) document.querySelector(`#${device.name} .button`).setAttribute('data-device-status', device.device_on);
            
            document.querySelector(`#${device.name} .use-relay`).setAttribute('data-use-relay', device.use_relay);
            document.querySelector(`#${device.name}`).setAttribute("data-last-change", device.last_change);

        });

        document.querySelector('div[data-tent-preference="min_temp"] input').value = response.tent_preferences.min_temp + '°';
        document.querySelector('div[data-tent-preference="min_humidity"] input').value = response.tent_preferences.min_humidity + '%';


        //UPDATE LAST CHANGE TIME FOR EACH DEVICE
        setInterval(() => {
            document.querySelectorAll('#relays > div').forEach(div => {
                const 
                last_change = new Date(div.getAttribute('data-last-change')),
                time_difference = Math.floor((new Date() - last_change) / 1000);

                const time_value = format_time_difference(time_difference)
                div.querySelector('.button span').innerText = time_value;
            });
        }, 1000);

        //FILL LAST RECORDS
        const records = response.last_records;
        document.querySelector('#last-date h2').innerText = new Date(records[0].date).toLocaleString('es-CL').replace(',', '');
        document.querySelector('#temperature h3').innerText = `${records[0].temperature}°`;
        document.querySelector('#humidity h3').innerText = `${records[0].humidity}%`;
        
        //FILL RECORDS TABLE
        document.querySelector('#records-table .table-body tbody').innerHTML = '';
        for (let i = 1; i < records.length; i++) {

            const tr = document.createElement('tr');
            tr.setAttribute('data-record-id', records[i].id);
            tr.innerHTML = `
                <td class="line">${i}</td>
                <td class="date">${new Date(records[i].date).toLocaleString('es-CL').replace(',', '')}</td>
                <td class="temperature">${records[i].temperature}°</td>
                <td class="humidity">${records[i].humidity}%</td>
            `;
            document.querySelector('#records-table tbody').appendChild(tr);
        }

        document.querySelector('#temperature-module input').value = response.sleep_values.temperature + ' secs.';
        document.querySelector('#water_pump-module input').value = response.sleep_values.water_pump + ' secs.';

        setInterval(() => {

            const 
            last_record_date = document.getElementById('next-record').getAttribute('data-last-record'),
            seconds_to_next_record = 30 - Math.floor( (new Date() - new Date(last_record_date)) / 1000 ),
            seconds_div = document.querySelector('#next-record h3');
            
            if (seconds_to_next_record >= 0) seconds_div.innerText = seconds_to_next_record + 's';
            else seconds_div.innerText = '-';
        
        }, 1000);

    });

    socket.on('new data from temperature sensor', data => {

        console.log(data)

        document.getElementById('next-record').setAttribute('data-last-record', data.now);

        const trs = document.querySelectorAll('#records-table tbody tr');
        for (let i = 0; i < trs.length; i++) {
            trs[i].querySelector('.line').innerText = i + 2;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="line">1</td>
            <td class="date">${document.querySelector('#last-date h2').innerText}</td>
            <td class="temperature">${document.querySelector('#temperature h3').innerText}</td>
            <td class="humidity">${document.querySelector('#humidity h3').innerText}</td>
        `;
        document.querySelector('#records-table tbody').prepend(tr);


        document.querySelector('#last-date h2').innerText = new Date(data.now).toLocaleString('es-CL').replace(',', '');
        document.querySelector('#temperature h3').innerText = `${data.temperature}°`;
        document.querySelector('#humidity h3').innerText = `${data.humidity}%`;

    })

    socket.on('received response from mcu', async response => {

        console.log(response);

        const btn = document.querySelector(`#${response.device } .button`);

        const data = response.mcu_data;
        for (let i = 0; i < data.length; i++) {
            document.querySelector(`#${data[i].name} .button`).setAttribute('data-device-status', data[i].on);
        }

        while (btn.classList.contains('animate-button')) {
            console.log("wait")
            await delay(10);
        }

        btn.classList.remove('animating');

    });

    socket.on('device status after timeout', data => {
        document.querySelector(`#${data.device} .button`).setAttribute('data-device-status', data.status);
    });

    socket.on('module sleep time changed', response => {
        document.querySelector(`#${response.module.name}-module input`).value = response.module.sleep_value + ' secs.';
    });

    socket.on('use relay option changed', response => {
        try {

            if (!response.success) throw 'Error. Success response from server is false';
            if (response.error !== undefined) throw response.error;

            console.log(response)
            document.querySelector(`#${response.relay_name} .use-relay`).setAttribute('data-use-relay', response.new_status);

        } catch(e) { console.log(e) }
    })

    socket.on('data from relays mcu updated', async mcu_response => {
        
        for (let device of mcu_response) {

            const btn = document.querySelector(`#${device.name} .button`);
            
            if (device.status_change) {
                document.querySelector(`#${device.name}`).setAttribute('data-last-change', new Date().toISOString())
                animate_button(btn);
                while (btn.classList.contains('animate-button')) await delay(10);    
            }
            
            btn.setAttribute('data-device-status', device.on)
        }
    })
    
    socket.on('tent preferences changed', response => {
        try {

            if (!response.success) throw 'Success response from server is false';
            if (response.error !== undefined) throw 'Error updating value';
    
            const txt_append = (response.new_data.field.includes('temp')) ? '°' : '%';
            document.querySelector(`div[data-tent-preference="${response.new_data.field}"] input`).value = response.new_data.value + txt_append;    
        } catch(e) { alert(e) }
    })

    socket.on('device in relays mcu switched off', data => {

        console.log(data);
        document.querySelector(`#${data.device}`).setAttribute('data-last-change', new Date(data.now).toISOString());
        document.querySelector(`#${data.device} .button`).setAttribute('data-device-status', 0);

    });

});

const animate_button = async button => {
    button.classList.add('animate-button', 'animating');
    button.addEventListener('animationend', () => {
        button.classList.remove('animate-button');
    }, { once: true })
}

//TOGGLE VIDEO FEED DIV
document.querySelectorAll('.close-video-stream').forEach(div => {
    div.addEventListener('click', function() {
        if (this.firstElementChild.classList.contains('fa-times')) {

            this.parentElement.querySelector('img').remove();
            this.firstElementChild.className = 'far fa-video';
            this.setAttribute('data-video-feed', 'off');

        } else {
            
            this.nextElementSibling.innerHTML = `<img src="http://192.168.0.75:81/stream" crossorigin="">`;
            this.firstElementChild.className = 'fas fa-times';
            this.setAttribute('data-video-feed', 'on');

        }
    })
});

//RELAYS BUTTONS
const get_relay_history = async device => {

    /*
    try {

        const
        get_history = await fetch('/get_device_history', {
            method: 'POST',
            headers: {
                "Content-Type" : "application/json"
            },
            body: JSON.stringify({ device })
        }),
        response = await get_history.json();

        console.log(response);

        if (!response.success) throw 'Success response from server is false';
        if (response.error !== undefined) throw response.error;



    } catch(e) { console.log(e); alert(e) }
    */
}

document.querySelectorAll('#relays .use-relay > div').forEach(div => {
    div.addEventListener('click', function() {

        const btn = this;

        if (btn.firstElementChild.className === 'fal fa-info') {
            get_relay_history(btn.parentElement.parentElement.id);
            return
        }

        const
        relay_name = btn.parentElement.parentElement.id,
        allowed = (btn.parentElement.getAttribute('data-use-relay') === 'true') ? true : false,
        i_class = btn.querySelector('i').classList[1];
    
        if ((i_class === 'fa-check' && allowed) || (i_class === 'fa-times' && !allowed)) return;

        const new_status = (allowed) ? false : true;

        socket.emit('change use relay option', { relay_name, new_status });
    
    })
});

document.querySelectorAll('#relays .button').forEach(button => {
    button.addEventListener('click', async function() {
        
        const 
        btn = this,
        status = (btn.getAttribute('data-device-status') == 1) ? false : true;

        animate_button(btn);

        const data = { device: btn.parentElement.id }

        if (btn.parentElement.id === 'humidifier_1' || btn.parentElement.id === 'humidifier_2') {
            data.humidifier_on = status;
            data.humidifier_number = parseInt(data.device.replace('humidifier_', ''));
        }
        else if (btn.parentElement.id === 'water_pump') data.spray_water = status;
        else if (btn.parentElement.id === 'heater_1') {
            data.heater_on = status;
            data.heater_number = 1;
        }
        else if (btn.parentElement.id === 'heater_2') {
            data.heater_on = status;
            data.heater_number = 2;            
        }

        socket.emit('control relay from browser', data);
    });
});

//CHANGE TENT PREFERENCES
document.querySelectorAll('#change-values div[data-save-btn=""]').forEach(div => {
    div.addEventListener('click', function() {

        const 
        field = this.parentElement.parentElement.getAttribute('data-tent-preference'),
        value = parseFloat(this.previousElementSibling.value.replace(/[^0-9.]/gm, ''));

        if (value === NaN) return;

        socket.emit('change tent preference', { field, value });
    });
});

//CHANGE RELAY MODULE SLEEP TIME VALUES
document.querySelectorAll('#change-values .save-module-preferences').forEach(btn => {
    btn.addEventListener('click', () => {

        const 
        name = btn.parentElement.parentElement.id.replace('-module', ''),
        sleep_value = parseInt(btn.previousElementSibling.value.replace(/[\D]/gm, ''));
    
        socket.emit('change module sleep time', { name, sleep_value });    
    })
});

document.querySelector('#more-records .button').addEventListener('click', async function() {

    animate_button(this);

    try {



        const
        offset = document.querySelectorAll('#records-table tbody tr').length,
        get_records = await fetch('/get_more_records', {
            method: 'POST',
            headers: { "Content-Type" : "application/json" },
            body: JSON.stringify({ offset })
        }),
        response = await get_records.json();

        if (!response.success) throw 'Success response from server is false.'
        if (response.error !== undefined) throw response.error;
        
        console.log(response);
        
        const table = document.querySelector('#records-table tbody');
        let line_number = offset;

        for (let row of response.records) {

            line_number++;

            const tr = document.createElement('tr');
            tr.setAttribute('data-record-id', row.id);
            tr.innerHTML = `
                <td class="line">${line_number}</td>
                <td class="date">${new Date(row.date).toLocaleString('es-CL').replace(',', '')}</td>
                <td class="temperature">${row.temperature}°</td>
                <td class="humidity">${row.humidity}%</td>
            `;

            table.appendChild(tr)
        }


    } catch(e) { console.log(e); alert(`Error getting rows.`) }
});