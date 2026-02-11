from flask import Flask, render_template, jsonify, request
from datetime import datetime
import json

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/data', methods=['GET'])
def get_data():
    """Dummy endpoint for potential API expansion (localStorage handles data)"""
    return jsonify({'status': 'ok'})

@app.route('/api/export', methods=['GET'])
def export_data():
    """Endpoint for exporting data (client-side mostly, but can validate here)"""
    return jsonify({'status': 'ok'})

if __name__ == '__main__': 
    app.run(debug=True, port=5000)