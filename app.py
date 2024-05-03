from flask import Flask, render_template, redirect, request
from flask_cors import CORS
from flask_socketio import SocketIO, join_room, leave_room, emit
import json, time

import src.api as api
import src.ai as ai

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, async_mode='threading')

# Dictionary to keep track of chat logs for each session
sessions = {}

@app.route('/')
def index():
    return render_template('index.html', problem_list=api.get_problems())

@app.route('/problems', methods=['POST'])
def problems():
    category = request.json.get('category')
    filters = request.json.get('filters')
    skip = request.json.get('skip')
    
    print(category, filters)
    
    return api.get_problems(category=category, filters=filters, skip=skip)

@app.route('/problem/<slug>')
def problem(slug):
    problem_data = api.get_problem_data(slug)
    return render_template('problem.html', problem_data=problem_data)

@app.route('/interpret/<slug>', methods=['POST'])
def interpret(slug):
    return api.interpret_code(slug, request.json)

@app.route('/check_interpret/<slug>/<id>', methods=['GET'])
def check_interpret(slug, id):
    return api.check_interpret(slug, id)

@socketio.on('connect')
def handle_connect():
    print('Client connected')
    session_id = request.sid
    join_room(session_id)
    
def get_timestamp(session_id):
    return time.time() * 1000 - sessions[session_id]['start_time']

def handle_ai_response(session_id):
    if sessions[session_id]['status'] != 'listening':
        return
        
    sessions[session_id]['last_response_timestamp'] = get_timestamp(session_id)
    print("Current timestamp:", get_timestamp(session_id))
    
    try:
        response = ai.get_response(sessions[session_id]['log'])
        print("Model response:", response)
        
        if response.strip() != "NO REPLY":
            # Synthesize speech
            sessions[session_id]['status'] = 'speaking'
            print("Speaking")
            
            for chunk in ai.synthesize_speech(response):
                emit('audio_chunk', {'data': chunk}, room=session_id)
                
            emit('audio_chunk_end', {}, room=session_id)
            
            sessions[session_id]['log'].append(json.dumps({
                "model_response": response,
                "timestamp": get_timestamp(session_id)
            }))
            
    except Exception as e:
        print("Failed to generate response:", e)
        emit('Gemini_error', {'message': 'Failed to generate response. Try saying something or write something to reprompt the model.'}, room=session_id)

@socketio.on('session_start')
def handle_session_start(data):
    session_id = request.sid
    
    sessions[session_id] = {
        'start_time': time.time() * 1000,
        'last_response_timestamp': 0,
        'status': 'listening', # speaking, listening
        'log': [
            json.dumps({
                "user_event": "session_start",
                "timestamp": 0,
                "event_data": data
            })
        ]
    }
    
    handle_ai_response(session_id)

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')
    
    session_id = request.sid
    try:
        del sessions[session_id]
        
        leave_room(session_id)
    except:
        pass
    
@socketio.on('audio')
def handle_audio(data):
    transcript, timestamp = ai.get_transcription(data['audio'], data['timestamp'])
    session_id = request.sid
    sessions[session_id]['log'].append(json.dumps({
        "user_event": "speech",
        "timestamp": timestamp,
        "event_data": transcript
    }))
    
    print("User response:", transcript)
    
    # Get response
    handle_ai_response(session_id)
    
@socketio.on('user_event')
def handle_user_event(data):
    print("User event:", data['event'])
    
    session_id = request.sid
    sessions[session_id]['log'].append(json.dumps({
       "user_event": data['event'],
       "timestamp": data['timestamp'],
       "event_data": data['data'] if 'data' in data else ""
    }))
    
    # Get response if it's been more than 5 seconds since the last response
    print(get_timestamp(session_id), sessions[session_id]['last_response_timestamp'])
    if (get_timestamp(session_id) - sessions[session_id]['last_response_timestamp'] > 5000):
        print("Responding to user event", data['event'])
        handle_ai_response(session_id)
        
@socketio.on('audio_playback_finished')
def handle_audio_playback_finished(data):
    session_id = request.sid
    sessions[session_id]['log'].append(json.dumps({
        "user_event": "audio_playback_finished",
        "timestamp": data['timestamp'],
        "message": "User has finished listening to the response. Give the candidate some time to respond."
    }))
    sessions[session_id]['status'] = 'listening'
    print("Listening")

if __name__ == '__main__':
    socketio.run(app, debug=True)
