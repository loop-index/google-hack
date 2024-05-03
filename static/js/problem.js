var socket = io.connect('https://' + document.domain + ':' + location.port);
var start_time;
var test_started = false;

// Configuring the Ace editor
var editor = ace.edit("editor");
editor.setTheme("ace/theme/github_dark");
editor.setReadOnly(true);

// Set the editor language based on the first language in the code snippets
var langSlug = $('#code-lang-select').val();
var lang = problem_data['code_snippets'].find(x => x.langSlug === langSlug);

// Initialize the interview session
$('#start-test-btn').click(function() {
    if (!test_started) {
        start_time = new Date().getTime();
        $('#start-test-btn').html('<i class="fa-solid fa-stop me-1"></i> End Test').removeClass('btn-success').addClass('btn-danger');
        test_started = true;

        editor.setReadOnly(false);

        socket.emit('session_start', {
            'problem_title': problem_data['problem_title'],
            'problem_content': problem_data['problem_content'],
            'problem_difficulty': problem_data['problem_difficulty'],
            'starting_lang': langSlug,
            'starting_code': lang['code'],
            'starting_test_cases': problem_data['example_testcases_input'],
        });
    } else {
        test_started = false;
        $('#start-test-btn').html('Test Ended').prop('disabled', true);
    }
});

// Set the editor language based on the selected language
editor.session.setMode("ace/mode/" + lang['ace_mode']);

editor.setShowPrintMargin(false);

// Configuring the audio recording
let mediaRecorder;
let audioChunks = [];
let recordDuration = 15000; // Duration of each recording slice in milliseconds

// Configuring audio playback
var audioContext;
var source;
let queue = [];

// Initialize the chunk buffer with ArrayBuffer
var chunk_buffer;

$(document).ready(async function() {
    // try {
    //     const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    //     mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    //     audioContext = new AudioContext();
    //     source = audioContext.createBufferSource();

    //     mediaRecorder.ondataavailable = function (e) {
    //         audioChunks.push(e.data);
    //     };

    //     mediaRecorder.onstop = async function() {
    //         const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    //         sendAudioToServer(audioBlob);
    //         audioChunks = []; // Clear the chunks array for next recording

    //         // After sending, start recording again
    //         await startRecording();
    //     };

    //     // Start initial recording
    //     await startRecording();
    // } catch (error) {
    //     console.error('Error accessing the microphone', error);
    // }
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new AudioContext();
        source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        source.connect(processor);
        processor.connect(audioContext.destination);

        let silenceStart = Date.now();
        const silenceThreshold = 3000; // 5 seconds of silence
        let audioChunks = [];

        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorder.ondataavailable = function (e) {
            audioChunks.push(e.data);
        };

        processor.onaudioprocess = function(e) {
            const input = e.inputBuffer.getChannelData(0);
            const isSilent = input.every(value => Math.abs(value) < 0.2);

            if (isSilent) {
                if (Date.now() - silenceStart > silenceThreshold) {
                    if (mediaRecorder.state === 'recording') {
                        mediaRecorder.stop();
                    }
                }
            } else {
                silenceStart = Date.now();
                if (mediaRecorder.state === 'inactive') {
                    mediaRecorder.start();
                }
            }
        };

        mediaRecorder.onstop = async function() {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            sendAudioToServer(audioBlob);
            audioChunks = []; // Clear the chunks array for next recording
        };
    } catch (error) {
        console.error('Error accessing the microphone', error);
    }
});

async function startRecording() {
    if (mediaRecorder.state === 'inactive') {
        mediaRecorder.start();
        setTimeout(() => {
            if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
            }
        }, recordDuration);
    }
}

function sendAudioToServer(blob) {
    socket.emit('audio', {
        'audio': blob,
        'timestamp': new Date().getTime() - start_time,
    });
    console.log('Audio sent to server');
}

// Audio playback
socket.on('audio_chunk', function(data) {
    const audioData = data.data;

    // Append the chunk to the buffer
    if (!chunk_buffer) {
        chunk_buffer = audioData;
    } else {
        // Merge the chunks into a single ArrayBuffer
        var tmp = new Uint8Array(chunk_buffer.byteLength + audioData.byteLength);
        tmp.set(new Uint8Array(chunk_buffer), 0);
        tmp.set(new Uint8Array(audioData), chunk_buffer.byteLength);
        chunk_buffer = tmp;
    }
});

socket.on('audio_chunk_end', function(data) {
    // Decode the audio data asynchronously
    audioContext.decodeAudioData(chunk_buffer.buffer, function(buffer) {
        const bufferSource = audioContext.createBufferSource();
        bufferSource.buffer = buffer;
        bufferSource.connect(audioContext.destination);
        bufferSource.start(0);

        // Notify when audio playback is finished
        bufferSource.onended = function() {
            console.log('Audio playback finished');
            socket.emit('audio_playback_finished', {
                'timestamp': new Date().getTime() - start_time,
            });
        };

        // Play buffer immediately or queue if still playing
        if (queue.length === 0 && audioContext.currentTime === 0) {
            bufferSource.start();
        } else {
            queue.push(bufferSource);
        }
    });

    // Clear the buffer
    chunk_buffer = null;
});

// Log user events
function logUserEvent(event, data) {
    $("#event-log").append(`<li>${event}: ${JSON.stringify(data)}</li>`);
    console.log(event, JSON.stringify(data));
    if (test_started){
        socket.emit('user_event', {
            'event': event,
            'data': data,
            'timestamp': new Date().getTime() - start_time,
        });
    }
}

// Interpret test cases
async function interpret_test_cases() {
    var concat_inputs = [];
    for (var i = 0; i < $(".test-case-tab-pane").length; i++) {
        // Join params
        var inputs = [];
        $(`.test-case-tab-pane:eq(${i}) .test-case-input`).each(function() {
            inputs.push($(this).val());
        });
        concat_inputs.push(inputs.join('\n'));
    }
    var payload = {
        "lang": $('#code-lang-select').val(),
        "question_id": problem_data['problem_id'],
        "typed_code": editor.getValue(),
        "data_input": concat_inputs.join('\n'),
    }

    logUserEvent('interpret_test_cases', payload);

    // Get interpret id first, then prompt backend to check interpret status
    return fetch('/interpret/' + problem_data['problem_slug'], {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    }).then(response => response.json()).then(async data => {
        var result = {};
        console.log(data);

        if (data && data['interpret_id']) {
            interpret_id = data['interpret_id'];
            
            return new Promise((resolve, reject) => {
                let break_flag = false;
                const timer = setInterval(() => {
                    if (break_flag) {
                        clearInterval(timer);
                        resolve(result);
                    }

                    fetch('/check_interpret/' + problem_data['problem_slug'] + '/' + interpret_id, {
                        method: 'GET',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                    }).then(response => response.json()).then(data => {
                        if (data != null && Object.keys(data).length > 0) {
                            // console.log(data);
                            if (data['state'] == 'SUCCESS') {
                                result = data;
                                break_flag = true;
                            }
                        }
                    }).catch(error => {
                        console.error('Error:', error);
                        break_flag = true;
                        reject(error);
                    });
                }, 1000);
            });
        } else {
            return {};
        }
    });
}

// Run test cases
$('#run-code-btn').click(async function() {
    // Hide compile error container and show test cases
    $('#compile-status-container').addClass('d-none');
    $('#compile-error-container').addClass('d-none');
    $('.code-result').addClass('d-none');
    $('.test-status').addClass('d-none');

    // Disable the button and show the spinner
    $('#run-code-btn').prop('disabled', true);
    $('#run-code-btn i').removeClass('fa-play').addClass('fa-spinner fa-spin');

    // Disable the editor
    editor.setReadOnly(true);

    interpret_test_cases().then(result => {
        // Show status
        $('#compile-status-container').removeClass('d-none');
        $('#run-status-msg').html(result['status_msg'] == "Accepted" ? '<span class="text-success">Accepted</span>' : '<span class="text-danger"' + (result['status_msg'] || 'Compile/Runtime Error') + '</span>');
        $('#run-status-time').text(result['status_runtime']);

        // Show compile error
        if (result['run_success'] == false) {
            $('#compile-error-container').removeClass('d-none');
            $('#compile-error-msg').text(result['compile_error'] || result['runtime_error'] || 'Something went wrong. Please try again.')

            // Log the error
            logUserEvent('run_error', {
                'error': result['compile_error'] || result['runtime_error'] || 'Server error'
            });
        }

        // Show outputs
        for (var i = 0; i < result['total_testcases']; i++) {
            // Stdout
            if (result['std_output_list'][i]) {
                $(`#test-${i}-stdout`).val(result['std_output_list'][i]);
                $(`#test-${i}-stdout-container`).removeClass('d-none');
            }

            // Expected Stdout
            if (result['expected_std_output_list'][i]) {
                $(`#test-${i}-expected-stdout`).val(result['expected_std_output_list'][i]);
                $(`#test-${i}-expected-stdout-container`).removeClass('d-none');
            }

            // Output & Expected
            if (result['code_answer'][i]) {
                $(`#test-${i}-output`).val(result['code_answer'][i]);
                $(`#test-${i}-output-container`).removeClass('d-none');
            }

            if (result['expected_code_answer'][i]) {
                $(`#test-${i}-expected-output`).val(result['expected_code_answer'][i]);
                $(`#test-${i}-expected-output-container`).removeClass('d-none');
            }

            // Acceptance
            if (result['compare_result'][i]) {
                $(`#test-${i}-status`).addClass('fa-check').removeClass('d-none fa-times');
            } else {
                $(`#test-${i}-status`).addClass('fa-times').removeClass('d-none fa-check');
            }
        }

        // Log the test case results
        logUserEvent('test_case_results', {
            'code_output': result['std_output_list'],
            'expected_code_output': result['expected_std_output_list'],
            'code_answer': result['code_answer'],
            'expected_code_answer': result['expected_code_answer'],
            'total_correct': result['total_correct'],
            'total_testcases': result['total_testcases'],
            'compare_result': result['compare_result'],
        });
    }).catch(error => {
        console.error('Error:', error);
    }).finally(() => {
        // Enable the button and hide the spinner
        $('#run-code-btn').prop('disabled', false);
        $('#run-code-btn i').removeClass('fa-spinner fa-spin').addClass('fa-play');

        // Enable the editor
        editor.setReadOnly(false);
    });
});

// Log cursor position
editor.session.selection.on('changeCursor', function(e) {
    var cursor = editor.getCursorPosition();
    $('#cursor-info').text(`line ${cursor.row + 1}, col ${cursor.column}`);
});

// Set the editor language based on the selected language
$('#code-lang-select').change(function() {
    var langSlug = $(this).val();
    var lang = problem_data['code_snippets'].find(x => x.langSlug === langSlug);
    editor.session.setMode("ace/mode/" + lang['ace_mode']);
    editor.setValue(lang['code']);

    logUserEvent('language_change', langSlug);
});

// Log code changes
var delta_buffer = [];
var delta_timeout_id = null;
var last_delta = null;

editor.session.on('change', function(delta) {
    // logUserEvent('code_change', delta);
    // return;

    // Clear the previous timeout
    if (delta_timeout_id) {
        clearTimeout(delta_timeout_id);   
    }

    // If this delta continues from the previous delta, ie. inserting on the same line, then merge them
    if (last_delta && last_delta.action === delta.action && delta.action == "insert" && last_delta.end.row === delta.start.row && last_delta.end.column === delta.start.column) {
        last_delta.lines.push(...delta.lines);
        last_delta.end = delta.end;
    }

    else if (last_delta && last_delta.action === delta.action && delta.action == "remove" && last_delta.start.row === delta.end.row && last_delta.start.column === delta.end.column) {
        last_delta.lines.unshift(...delta.lines);
        last_delta.start = delta.start;
    }

    // Otherwise, push the delta to the buffer
    else {
        if (last_delta) {
            delta_buffer.push({
                'action': last_delta.action,
                'chars': last_delta.lines.join(''),
                'start': last_delta.start,
                'end': last_delta.end,
            });
        }
        last_delta = delta;
    }

    // Set a timeout to log the delta
    delta_timeout_id = setTimeout(function() {
        if (last_delta) {
            delta_buffer.push({
                'action': last_delta.action,
                'chars': last_delta.lines.join(''),
                'start': last_delta.start,
                'end': last_delta.end,
            });
        }

        logUserEvent('code_edited', {
            'delta': delta_buffer
        });

        // Also log the current code
        logUserEvent('current_code', {
            'value': editor.getValue(),
            'cursor': 'line ' + (editor.getCursorPosition().row + 1) + ', col ' + (editor.getCursorPosition().column + 1),
        });

        delta_buffer = [];
        last_delta = null;
    }, 1000);
});

// Log editor messages on hover
editor.getSession().on("changeAnnotation", function () {
});

// Error handling
socket.on('Gemini_error', function(data) {
    console.error('Gemini error:', data);
    alert('Gemini error: ' + data['message']);
});