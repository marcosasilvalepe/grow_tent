#!/bin/python3

import os
from datetime import datetime
import glob

def check_for_running_process():
    print("error")



path = "D:/xampp/htdocs/grow/streams/"

try:

    now = str(datetime.now()).replace(" ", "_").split('.')[0]
    os.system("cd " + path)

    files = os.listdir("./streams/")

    for file in files:
        print(os.stat("./streams/" + file))

except Exception as e: print(e)