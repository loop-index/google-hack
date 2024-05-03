from openai import OpenAI
import google.generativeai as genai
from google.cloud import texttospeech_v1
from dotenv import load_dotenv
import os
from pathlib import Path
from pydub import AudioSegment

load_dotenv()

client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
genai.configure(api_key=os.getenv('GOOGLE_API_KEY'))
# client = texttospeech_v1.TextToSpeechClient()
model = genai.GenerativeModel('gemini-pro')

# Function to detect leading silence
# Returns the number of milliseconds until the first sound (chunk averaging more than X decibels)
def milliseconds_until_sound(sound, silence_threshold_in_decibels=-20.0, chunk_size=10):
    trim_ms = 0  # ms

    assert chunk_size > 0  # to avoid infinite loop
    while sound[trim_ms:trim_ms+chunk_size].dBFS < silence_threshold_in_decibels and trim_ms < len(sound):
        trim_ms += chunk_size

    return trim_ms

def trim_start(filepath):
    path = Path(filepath)
    directory = path.parent
    filename = path.name
    audio = AudioSegment.from_file(filepath, format="webm")
    start_trim = milliseconds_until_sound(audio)
    trimmed = audio[start_trim:]
    new_filename = directory / f"trimmed_{filename.replace('.webm', '.wav')}"
    trimmed.export(new_filename, format="wav")
    return start_trim, trimmed, new_filename

def get_transcription(blob, timestamp):
    old_filename = 'temp.webm'
    with open(old_filename, 'wb') as f:
        f.write(blob)
        
    # Trim silence from start
    start_trim, trimmed, filename = trim_start(old_filename)
        
    # Get transcription
    output = "Silence."
    if trimmed.duration_seconds > 0.1:
        print(trimmed.duration_seconds)
        # audio_file = genai.upload_file(path=filename)
        # prompt = "Transcribe the audio. Only return the text. No other information is needed."
        # response = model.generate_content([prompt, audio_file])
        # # print(response.text)
        # output = response.text.strip()
        
        audio_file = open(filename, 'rb')
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file,
            response_format="text"
        )
        output = transcript.strip()
    
    # Delete temporary file
    try:
        os.remove(filename)
    except:
        pass
    
    try:
        os.remove(old_filename)
    except:
        pass
    
    return output, timestamp - start_trim
    
def get_response(log):
    pre_prompt = """
    You are Gemini, the hiring manager for a software engineering team participating in a real-time technical interview with a candidate. The simulated interview uses questions from LeetCode. The interface allows the candidate to write code and run it against test cases. Given below is an event log from the interview, including UI interactions, real-time voice chat from the candidate, and your previous responses. Engage with the candidate and give them hints if they seem stuck, but do not explain the entire solution right away. You can also ask the candidate to explain their thought process at any point, or engage in small talk. If the interview just started, you can introduce yourself and the test. You can also choose to not reply if you deem the new events from your last response trivial, by responding "NO REPLY". Respond with 1-2 short sentences, imagine you are talking in person in real time and have to give the candidate time to answer. TRY NOT TO TALK IF THE CANDIDATE DOESN'T RESPOND UNLESS A LONG TIME HAS PASSED BASED ON TIMESTAMPS (AROUND 10 SECONDS). DO NOT INCLUDE THINGS LIKE EMOJIS OR NARRATIVE CUES, JUST RAW SPEECH. The event log is as follows:
    """
    
    prompt = pre_prompt + "\n".join(log)
    try:
        response = model.generate_content([prompt])
        
        return response.text.strip()
    except:
        raise Exception("Failed to generate response")

def synthesize_speech(text):
    # input = texttospeech_v1.SynthesisInput()
    # input.text = text
    
    # voice = texttospeech_v1.VoiceSelectionParams()
    # voice.language_code = "en-US"
    # voice.ssml_gender = texttospeech_v1.SsmlVoiceGender.NEUTRAL
    
    # audio_config = texttospeech_v1.AudioConfig()
    # audio_config.audio_encoding = texttospeech_v1.AudioEncoding.LINEAR16
    
    # request = texttospeech_v1.SynthesizeSpeechRequest(
    #     input=input,
    #     voice=voice,
    #     audio_config=audio_config,
    # )

    # # Make the request
    # response = client.synthesize_speech(request=request)

    # # Handle the response
    # print(response)
    
    response = client.audio.speech.create(
        model="tts-1",
        voice="shimmer",
        input=text,
        response_format="wav",
        speed=1.5,
    )
    
    for chunk in response.iter_bytes(chunk_size=1024):
        yield chunk