* Preparations
  
    + Create an API key
    + Export API key as environment variable
    + Install the SDK
* Chat
  
    + Qwen
    + DeepSeek
    + Kimi
    + GLM
    + MiniMax
* Specialized models
  
    + Qwen-MT
    + Qwen-Deep-Research
    + Qwen-OCR
* Real-time multimodal
  
    + Client events
    + Server events
    + Python SDK
    + Java SDK
    + Interaction flow
    + Voice cloning
* Speech synthesis
  
    + Real-time speech synthesis (CosyVoice)
    + Real-time speech synthesis (Qwen-TTS-Realtime)
        
        - Client events
        - Server events
        - Python SDK
        - Java SDK
        - Interaction flow for real-time speech synthesis
        - Qwen voice cloning
        - Qwen voice design
    + Speech synthesis (Qwen-TTS)
* Music generation
  
    + Music generation(Fun-music)
* Speech recognition
  
    + Real-time speech recognition (Paraformer)
    + Real-time speech recognition (Fun-ASR)
    + Real-time speech recognition (Qwen-ASR-Realtime)

    + Recording file recognition (Fun-ASR)
    + Audio file recognition (Qwen-ASR)
    + Custom hotwords
* Speech translation
  
    + Real-time audio and video translation (Qwen-Livetranslate-Realtime)
    + Audio and video translation API reference
* Text embedding
  
    + Synchronous API details
* Multimodal embedding
  
    + Multimodal embeddings
* More models
  
    + Rerank
    + Intent recognition
* Fine-tuning (training)
  
    + Video generation model fine-tuning API reference
* More
  
    + Error messages
    + Generate a temporary API key
    + Manage asynchronous tasks
    + Call a model in a sub-workspace
    + Upload files and get temporary URLs
    + Configure connection reuse for DashScope SDK

Home Page Alibaba Cloud Model Studio API Reference (Models) Speech synthesis Real-time speech synthesis (Qwen-TTS-Realtime) Qwen voice cloning

# Qwen voice cloning API reference

Updated at: 2026-03-31 07:15:19

Copy as MD

[Product](https://www.alibabacloud.com/product/modelstudio)

Voice cloning lets you clone voices without training. Provide 10 to 20 seconds of audio to generate a similar, natural-sounding custom voice. Voice cloning and speech synthesis are two sequential steps. This topic covers voice cloning parameters and API details. For speech synthesis, see Real-time speech synthesis - Qwen or Speech synthesis - Qwen .

**User guide** : For model introductions and selection recommendations, see Real-time speech synthesis – Qwen or Speech synthesis – Qwen .

**Important**

This topic is for the Qwen voice cloning API. If you use the CosyVoice model, see the CosyVoice voice cloning and design API .

## **Audio requirements**

High-quality input audio is essential for high-fidelity cloned voices.

|**Item** |**Requirement** |
| --- | --- |

|**Item** |**Requirement** |
| --- | --- |
|**Supported formats** |WAV (16-bit), MP3, M4A |
|**Duration** |10–20 seconds recommended (maximum 60 seconds). |
|**File size** |< 10 MB |
|**Sample rate** |≥ 24 kHz |
|**Channels** |Mono |
|**Content** |The audio must contain at least 3 seconds of continuous, clear speech (no background sound). Short pauses (≤ 2 seconds) are acceptable. Avoid background music, noise, or other voices. Use normal speech only — no singing. |
|**Language** |Chinese (zh), English (en), German (de), Italian (it), Portuguese (pt), Spanish (es), Japanese (ja), Korean (ko), French (fr), Russian (ru) |

## Getting started: From cloning to synthesis

image

### 1\. Workflow

Voice cloning and speech synthesis are two sequential steps. Follow a create-then-use workflow:

1. Create a voice
   
   Call the Create voice API and upload an audio segment. The system analyzes the audio and creates a unique cloned voice. **In this step, you must set** `**target_model**` **to the speech synthesis model that will use the created voice.**
   
   If you have already created a voice model, you can skip this step. Call the List voices API to view a list of your voice models.
2. Use the voice for speech synthesis.
   
   Call the speech synthesis API and pass the voice clone obtained in the previous step. **The speech synthesis model specified in this step must match the** `**target_model**` **from the previous step.**

### 2\. Model configuration and preparations

Select appropriate models and complete preparations.

#### Model configuration

You must specify two models for voice cloning:

* Voice cloning model: qwen-voice-enrollment
* Timbre-driven speech synthesis models (two types):
  
    + **Qwen3-TTS-VC-Realtime** (see Real-time speech synthesis - Qwen ):
        
        - qwen3-tts-vc-realtime-2026-01-15
        - qwen3-tts-vc-realtime-2025-11-27
    + **Qwen3-TTS-VC** (see Speech synthesis - Qwen ):
        
        - qwen3-tts-vc-2026-01-22

#### Preparations

1. **Get an API key** : See Get an API key . For security reasons, we recommend setting your API key as an environment variable.
2. **Install the SDK** : Make sure you have installed the latest version of the DashScope SDK .
3. **Prepare the audio to be cloned** : The audio must comply with the requirements specified in the Audio requirements and best practices for the CosyVoice Voice Cloning/Design API.

### 3\. Sample code

The following examples show how to clone a voice and use it for speech synthesis.

* **Key principle** : During voice cloning, the `target_model` , which is the speech synthesis model used to drive the voice, must be the same as the model you specify when you call the speech synthesis API. Otherwise, the synthesis will fail.
* This example uses the local audio file `voice.mp3` for voice cloning. You must replace it with your own audio file when you run the code.

Bidirectional streaming synthesis

Non-streaming and unidirectional streaming synthesis

This applies to the Qwen3-TTS-VC-Realtime series of models. See Real-time speech synthesis – Qwen .

Python

Java

```
# coding=utf-8 # Installation instructions for pyaudio: # APPLE Mac OS X #   brew install portaudio #   pip install pyaudio # Debian/Ubuntu #   sudo apt-get install python-pyaudio python3-pyaudio #   or #   pip install pyaudio # CentOS #   sudo yum install -y portaudio portaudio-devel && pip install pyaudio # Microsoft Windows #   python -m pip install pyaudio import  pyaudio
 import  os
 import  requests
 import  base64
 import  pathlib
 import  threading
 import  time
 import  dashscope   # DashScope Python SDK version must be 1.23.9 or higher from  dashscope.audio.qwen_tts_realtime  import  QwenTtsRealtime, QwenTtsRealtimeCallback, AudioFormat

 # ======= Constants ======= 
DEFAULT_TARGET_MODEL =  "qwen3-tts-vc-realtime-2026-01-15" # Target model for voice cloning and speech synthesis must match 
DEFAULT_PREFERRED_NAME =  "guanyu" 
DEFAULT_AUDIO_MIME_TYPE =  "audio/mpeg" 
VOICE_FILE_PATH =  "voice.mp3" # Relative path to local audio file used for voice cloning 

TEXT_TO_SYNTHESIZE = [
     'Right? I love supermarkets like this.' ,
     'Especially during Chinese New Year' ,
     'When I go shopping' ,
     'I feel' ,
     'Extremely happy!' ,
     'And want to buy so many things!' 
]

 def create_voice ( file_path:  str ,
                 target_model:  str  = DEFAULT_TARGET_MODEL,
                 preferred_name:  str  = DEFAULT_PREFERRED_NAME,
                 audio_mime_type:  str  = DEFAULT_AUDIO_MIME_TYPE ) ->  str :
     """
    Create a voice and return the voice parameter
    """ # API keys differ between the Singapore and Beijing regions. Get your API key: https://www.alibabacloud.com/help/zh/model-studio/get-api-key # If you have not configured an environment variable, replace the next line with your Model Studio API key: api_key = "sk-xxx" 
    api_key = os.getenv( "DASHSCOPE_API_KEY" )

    file_path_obj = pathlib.Path(file_path)
     if not  file_path_obj.exists():
         raise  FileNotFoundError( f"Audio file not found:  {file_path} " )

    base64_str = base64.b64encode(file_path_obj.read_bytes()).decode()
    data_uri =  f"data: {audio_mime_type} ;base64, {base64_str} " # This URL is for the Singapore region. To use a model from the Beijing region, replace the URL with: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization 
    url =  "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization" 
    payload = {
         "model" :  "qwen-voice-enrollment" ,  # Do not change this value "input" : {
             "action" :  "create" ,
             "target_model" : target_model,
             "preferred_name" : preferred_name,
             "audio" : { "data" : data_uri}
        }
    }
    headers = {
         "Authorization" :  f"Bearer  {api_key} " ,
         "Content-Type" :  "application/json" 
    }

    resp = requests.post(url, json=payload, headers=headers)
     if  resp.status_code !=  200 :
         raise  RuntimeError( f"Failed to create voice:  {resp.status_code} ,  {resp.text} " )

     try :
         return  resp.json()[ "output" ][ "voice" ]
     except  (KeyError, ValueError)  as  e:
         raise  RuntimeError( f"Failed to parse voice response:  {e} " )

 def init_dashscope_api_key ():
     """
    Initialize DashScope SDK API key
    """ # API keys differ between the Singapore and Beijing regions. Get your API key: https://www.alibabacloud.com/help/zh/model-studio/get-api-key # If you have not configured an environment variable, replace the next line with your Model Studio API key: dashscope.api_key = "sk-xxx" 
    dashscope.api_key = os.getenv( "DASHSCOPE_API_KEY" )

 # ======= Callback class ======= class MyCallback ( QwenTtsRealtimeCallback ):
     """
    Custom TTS streaming callback
    """ def __init__ ( self ):
        self.complete_event = threading.Event()
        self._player = pyaudio.PyAudio()
        self._stream = self._player. open (
             format =pyaudio.paInt16, channels= 1 , rate= 24000 , output= True 
        )

     def on_open ( self ) ->  None :
         print ( '[TTS] Connection established' )

     def on_close ( self, close_status_code, close_msg ) ->  None :
        self._stream.stop_stream()
        self._stream.close()
        self._player.terminate()
         print ( f'[TTS] Connection closed code= {close_status_code} , msg= {close_msg} ' )

     def on_event ( self, response:  dict ) ->  None :
         try :
            event_type = response.get( 'type' ,  '' )
             if  event_type ==  'session.created' :
                 print ( f'[TTS] Session started:  {response[ "session" ][ "id" ]} ' )
             elif  event_type ==  'response.audio.delta' :
                audio_data = base64.b64decode(response[ 'delta' ])
                self._stream.write(audio_data)
             elif  event_type ==  'response.done' :
                 print ( f'[TTS] Response completed, Response ID:  {qwen_tts_realtime.get_last_response_id()} ' )
             elif  event_type ==  'session.finished' :
                 print ( '[TTS] Session ended' )
                self.complete_event. set ()
         except  Exception  as  e:
             print ( f'[Error] Exception in callback event handler:  {e} ' )

     def wait_for_finished ( self ):
        self.complete_event.wait()

 # ======= Main execution logic ======= if  __name__ ==  '__main__' :
    init_dashscope_api_key()
     print ( '[System] Initializing Qwen TTS Realtime ...' )

    callback = MyCallback()
    qwen_tts_realtime = QwenTtsRealtime(
        model=DEFAULT_TARGET_MODEL,
        callback=callback,
         # This URL is for the Singapore region. To use a model from the Beijing region, replace the URL with: wss://dashscope.aliyuncs.com/api-ws/v1/realtime 
        url= 'wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime' 
    )
    qwen_tts_realtime.connect()
    
    qwen_tts_realtime.update_session(
        voice=create_voice(VOICE_FILE_PATH),  # Replace voice parameter with cloned voice 
        response_format=AudioFormat.PCM_24000HZ_MONO_16BIT,
        mode= 'server_commit' 
    )

     for  text_chunk  in  TEXT_TO_SYNTHESIZE:
         print ( f'[Sending text]:  {text_chunk} ' )
        qwen_tts_realtime.append_text(text_chunk)
        time.sleep( 0.1 )

    qwen_tts_realtime.finish()
    callback.wait_for_finished()

     print ( f'[Metric] session_id= {qwen_tts_realtime.get_session_id()} , ' f'first_audio_delay= {qwen_tts_realtime.get_first_audio_delay()} s' )
```

You need to import the Gson dependency. If you use Maven or Gradle, add the dependency as follows:

Maven

Gradle

Add the following to your `pom.xml` :

```
<!-- https://mvnrepository.com/artifact/com.google.code.gson/gson --> < dependency > < groupId > com.google.code.gson </ groupId > < artifactId > gson </ artifactId > < version > 2.13.1 </ version > </ dependency >
```

Add the following to your `build.gradle` :

```
// https://mvnrepository.com/artifact/com.google.code.gson/gson 
implementation( "com.google.code.gson:gson:2.13.1" )
```

```
import  com.alibaba.dashscope.audio.qwen_tts_realtime.*;
 import  com.alibaba.dashscope.exception.NoApiKeyException;
 import  com.google.gson.Gson;
 import  com.google.gson.JsonObject;

 import  javax.sound.sampled.*;
 import  java.io.*;
 import  java.net.HttpURLConnection;
 import  java.net.URL;
 import  java.nio.file.*;
 import  java.nio.charset.StandardCharsets;
 import  java.util.Base64;
 import  java.util.Queue;
 import  java.util.concurrent.CountDownLatch;
 import  java.util.concurrent.atomic.AtomicReference;
 import  java.util.concurrent.ConcurrentLinkedQueue;
 import  java.util.concurrent.atomic.AtomicBoolean;

 public class Main  {
     // ===== Constants ===== // Target model for voice cloning and speech synthesis must match private static final String TARGET_MODEL = "qwen3-tts-vc-realtime-2026-01-15" ;
     private static final String PREFERRED_NAME = "guanyu" ;
     // Relative path to local audio file used for voice cloning private static final String AUDIO_FILE = "voice.mp3" ;
     private static final String AUDIO_MIME_TYPE = "audio/mpeg" ;
     private static  String[] textToSynthesize = {
             "Right? I love supermarkets like this." ,
             "Especially during Chinese New Year" ,
             "When I go shopping" ,
             "I feel" ,
             "Extremely happy!" ,
             "And want to buy so many things!" 
    };

     // Generate data URI public static  String  toDataUrl (String filePath) throws  IOException {
         byte [] bytes = Files.readAllBytes(Paths.get(filePath));
         String encoded =  Base64.getEncoder().encodeToString(bytes);
         return "data:"  + AUDIO_MIME_TYPE +  ";base64,"  + encoded;
    }

     // Call API to create voice public static  String  createVoice () throws  Exception {
         // API keys differ between the Singapore and Beijing regions. Get your API key: https://www.alibabacloud.com/help/zh/model-studio/get-api-key // If you have not configured an environment variable, replace the next line with your Model Studio API key: String apiKey = "sk-xxx" String apiKey =  System.getenv( "DASHSCOPE_API_KEY" );

         String jsonPayload = "{" 
                        +  "\"model\": \"qwen-voice-enrollment\"," // Do not change this value 
                        +  "\"input\": {" 
                        +      "\"action\": \"create\"," 
                        +      "\"target_model\": \""  + TARGET_MODEL +  "\"," 
                        +      "\"preferred_name\": \""  + PREFERRED_NAME +  "\"," 
                        +      "\"audio\": {" 
                        +          "\"data\": \""  + toDataUrl(AUDIO_FILE) +  "\"" 
                        +      "}" 
                        +  "}" 
                        +  "}" ;

         HttpURLConnection con =  (HttpURLConnection)  new URL ( "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization" ).openConnection();
        con.setRequestMethod( "POST" );
        con.setRequestProperty( "Authorization" ,  "Bearer "  + apiKey);
        con.setRequestProperty( "Content-Type" ,  "application/json" );
        con.setDoOutput( true );

         try  ( OutputStream os =  con.getOutputStream()) {
            os.write(jsonPayload.getBytes(StandardCharsets.UTF_8));
        }

         int status =  con.getResponseCode();
        System.out.println( "HTTP Status Code: "  + status);

         try  ( BufferedReader br = new BufferedReader (
                 new InputStreamReader (status >=  200  && status <  300  ? con.getInputStream() : con.getErrorStream(),
                        StandardCharsets.UTF_8))) {
             StringBuilder response = new StringBuilder ();
            String line;
             while  ((line = br.readLine()) !=  null ) {
                response.append(line);
            }
            System.out.println( "Response: "  + response);

             if  (status ==  200 ) {
                 JsonObject jsonObj = new Gson ().fromJson(response.toString(), JsonObject.class);
                 return  jsonObj.getAsJsonObject( "output" ).get( "voice" ).getAsString();
            }
             throw new IOException ( "Failed to create voice: "  + status +  " - "  + response);
        }
    }

     // Real-time PCM audio player class public static class RealtimePcmPlayer  {
         private int  sampleRate;
         private  SourceDataLine line;
         private  AudioFormat audioFormat;
         private  Thread decoderThread;
         private  Thread playerThread;
         private AtomicBoolean stopped = new AtomicBoolean ( false );
         private  Queue<String> b64AudioBuffer =  new ConcurrentLinkedQueue <>();
         private  Queue< byte []> RawAudioBuffer =  new ConcurrentLinkedQueue <>();

         // Constructor initializes audio format and audio line public RealtimePcmPlayer ( int  sampleRate) throws  LineUnavailableException {
             this .sampleRate = sampleRate;
             this .audioFormat =  new AudioFormat ( this .sampleRate,  16 ,  1 ,  true ,  false );
            DataLine. Info info = new DataLine .Info(SourceDataLine.class, audioFormat);
            line = (SourceDataLine) AudioSystem.getLine(info);
            line.open(audioFormat);
            line.start();
            decoderThread =  new Thread ( new Runnable () {
                 @Override public void run ()  {
                     while  (!stopped.get()) {
                         String b64Audio =  b64AudioBuffer.poll();
                         if  (b64Audio !=  null ) {
                             byte [] rawAudio = Base64.getDecoder().decode(b64Audio);
                            RawAudioBuffer.add(rawAudio);
                        }  else  {
                             try  {
                                Thread.sleep( 100 );
                            }  catch  (InterruptedException e) {
                                 throw new RuntimeException (e);
                            }
                        }
                    }
                }
            });
            playerThread =  new Thread ( new Runnable () {
                 @Override public void run ()  {
                     while  (!stopped.get()) {
                         byte [] rawAudio = RawAudioBuffer.poll();
                         if  (rawAudio !=  null ) {
                             try  {
                                playChunk(rawAudio);
                            }  catch  (IOException e) {
                                 throw new RuntimeException (e);
                            }  catch  (InterruptedException e) {
                                 throw new RuntimeException (e);
                            }
                        }  else  {
                             try  {
                                Thread.sleep( 100 );
                            }  catch  (InterruptedException e) {
                                 throw new RuntimeException (e);
                            }
                        }
                    }
                }
            });
            decoderThread.start();
            playerThread.start();
        }

         // Play an audio chunk and block until playback completes private void playChunk ( byte [] chunk) throws  IOException, InterruptedException {
             if  (chunk ==  null  || chunk.length ==  0 )  return ;

             int bytesWritten = 0 ;
             while  (bytesWritten < chunk.length) {
                bytesWritten += line.write(chunk, bytesWritten, chunk.length - bytesWritten);
            }
             int audioLength =  chunk.length / ( this .sampleRate* 2 / 1000 );
             // Wait for audio in buffer to finish playing 
            Thread.sleep(audioLength -  10 );
        }

         public void write (String b64Audio)  {
            b64AudioBuffer.add(b64Audio);
        }

         public void cancel ()  {
            b64AudioBuffer.clear();
            RawAudioBuffer.clear();
        }

         public void waitForComplete () throws  InterruptedException {
             while  (!b64AudioBuffer.isEmpty() || !RawAudioBuffer.isEmpty()) {
                Thread.sleep( 100 );
            }
            line.drain();
        }

         public void shutdown () throws  InterruptedException {
            stopped.set( true );
            decoderThread.join();
            playerThread.join();
             if  (line !=  null  && line.isRunning()) {
                line.drain();
                line.close();
            }
        }
    }

     public static void main (String[] args) throws  Exception {
         QwenTtsRealtimeParam param =  QwenTtsRealtimeParam.builder()
                .model(TARGET_MODEL)
                 // This URL is for the Singapore region. To use a model from the Beijing region, replace the URL with: wss://dashscope.aliyuncs.com/api-ws/v1/realtime 
                .url( "wss://dashscope-intl.aliyuncs.com/api-ws/v1/realtime" )
                 // API keys differ between the Singapore and Beijing regions. Get your API key: https://www.alibabacloud.com/help/zh/model-studio/get-api-key // If you have not configured an environment variable, replace the next line with your Model Studio API key: .apikey("sk-xxx") 
                .apikey(System.getenv( "DASHSCOPE_API_KEY" ))
                .build();
        AtomicReference<CountDownLatch> completeLatch =  new AtomicReference <>( new CountDownLatch ( 1 ));
         final  AtomicReference<QwenTtsRealtime> qwenTtsRef =  new AtomicReference <>( null );

         // Create real-time audio player instance RealtimePcmPlayer audioPlayer = new RealtimePcmPlayer ( 24000 );

         QwenTtsRealtime qwenTtsRealtime = new QwenTtsRealtime (param,  new QwenTtsRealtimeCallback () {
             @Override public void onOpen ()  {
                 // Handle connection established 
            }
             @Override public void onEvent (JsonObject message)  {
                 String type =  message.get( "type" ).getAsString();
                 switch (type) {
                     case "session.created" :
                         // Handle session created break ;
                     case "response.audio.delta" :
                         String recvAudioB64 =  message.get( "delta" ).getAsString();
                         // Play audio in real time 
                        audioPlayer.write(recvAudioB64);
                         break ;
                     case "response.done" :
                         // Handle response completed break ;
                     case "session.finished" :
                         // Handle session ended 
                        completeLatch.get().countDown();
                     default :
                         break ;
                }
            }
             @Override public void onClose ( int  code, String reason)  {
                 // Handle connection closed 
            }
        });
        qwenTtsRef.set(qwenTtsRealtime);
         try  {
            qwenTtsRealtime.connect();
        }  catch  (NoApiKeyException e) {
             throw new RuntimeException (e);
        }
         QwenTtsRealtimeConfig config =  QwenTtsRealtimeConfig.builder()
                .voice(createVoice())  // Replace voice parameter with the exclusive voice generated by voice cloning 
                .responseFormat(QwenTtsRealtimeAudioFormat.PCM_24000HZ_MONO_16BIT)
                .mode( "server_commit" )
                .build();
        qwenTtsRealtime.updateSession(config);
         for  (String text:textToSynthesize) {
            qwenTtsRealtime.appendText(text);
            Thread.sleep( 100 );
        }
        qwenTtsRealtime.finish();
        completeLatch.get().await();

         // Wait for audio playback to complete and shut down player 
        audioPlayer.waitForComplete();
        audioPlayer.shutdown();
        System.exit( 0 );
    }
}
```

This applies to the Qwen3-TTS-VC series of models. See Speech synthesis - Qwen .

This example uses the non-streaming output sample code from the DashScope SDK. The `voice` parameter is replaced with a custom voice generated by voice cloning. For unidirectional streaming synthesis, see Speech synthesis - Qwen .

Python

Java

```
import  os
 import  requests
 import  base64
 import  pathlib
 import  dashscope

 # ======= Constant configuration ======= 
DEFAULT_TARGET_MODEL =  "qwen3-tts-vc-2026-01-22" # Use the same model for voice cloning and speech synthesis 
DEFAULT_PREFERRED_NAME =  "guanyu" 
DEFAULT_AUDIO_MIME_TYPE =  "audio/mpeg" 
VOICE_FILE_PATH =  "voice.mp3" # Relative path to the local audio file used for voice cloning def create_voice ( file_path:  str ,
                 target_model:  str  = DEFAULT_TARGET_MODEL,
                 preferred_name:  str  = DEFAULT_PREFERRED_NAME,
                 audio_mime_type:  str  = DEFAULT_AUDIO_MIME_TYPE ) ->  str :
     """
    Create a voice and return the voice parameter.
    """ # If you haven't configured an environment variable, replace the following line with: api_key = "sk-xxx" 
    api_key = os.getenv( "DASHSCOPE_API_KEY" )

    file_path_obj = pathlib.Path(file_path)
     if not  file_path_obj.exists():
         raise  FileNotFoundError( f"Audio file does not exist:  {file_path} " )

    base64_str = base64.b64encode(file_path_obj.read_bytes()).decode()
    data_uri =  f"data: {audio_mime_type} ;base64, {base64_str} " # Singapore region endpoint. For the Beijing region, use: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization 
    url =  "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization" 
    payload = {
         "model" :  "qwen-voice-enrollment" ,  # Do not change this value "input" : {
             "action" :  "create" ,
             "target_model" : target_model,
             "preferred_name" : preferred_name,
             "audio" : { "data" : data_uri}
        }
    }
    headers = {
         "Authorization" :  f"Bearer  {api_key} " ,
         "Content-Type" :  "application/json" 
    }

    resp = requests.post(url, json=payload, headers=headers)
     if  resp.status_code !=  200 :
         raise  RuntimeError( f"Failed to create voice:  {resp.status_code} ,  {resp.text} " )

     try :
         return  resp.json()[ "output" ][ "voice" ]
     except  (KeyError, ValueError)  as  e:
         raise  RuntimeError( f"Failed to parse voice response:  {e} " )

 if  __name__ ==  '__main__' :
     # Singapore region endpoint. For the Beijing region, use: https://dashscope.aliyuncs.com/api/v1 
    dashscope.base_http_api_url =  'https://dashscope-intl.aliyuncs.com/api/v1' 

    text =  "How's the weather today?" # SpeechSynthesizer interface usage: dashscope.audio.qwen_tts.SpeechSynthesizer.call(...) 
    response = dashscope.MultiModalConversation.call(
        model=DEFAULT_TARGET_MODEL,
         # If you haven't configured an environment variable, replace the following line with: api_key = "sk-xxx" 
        api_key=os.getenv( "DASHSCOPE_API_KEY" ),
        text=text,
        voice=create_voice(VOICE_FILE_PATH),  # Replace the voice parameter with the custom voice generated by cloning 
        stream= False 
    )
     print (response)
```

Add the Gson dependency to your project.

Maven

Gradle

Add the following content to `pom.xml` :

```
<!-- https://mvnrepository.com/artifact/com.google.code.gson/gson --> < dependency > < groupId > com.google.code.gson </ groupId > < artifactId > gson </ artifactId > < version > 2.13.1 </ version > </ dependency >
```

Add the following content to `build.gradle` :

```
// https://mvnrepository.com/artifact/com.google.code.gson/gson 
implementation( "com.google.code.gson:gson:2.13.1" )
```

**Important**

When you use speech synthesis with a custom voice generated by voice cloning, configure the voice as follows:

```
MultiModalConversationParam param =  MultiModalConversationParam.builder()
                .parameter( "voice" ,  "your_voice" )  // Replace the voice parameter with the custom voice generated by cloning 
                .build();
```

```
import  com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversation;
 import  com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationParam;
 import  com.alibaba.dashscope.aigc.multimodalconversation.MultiModalConversationResult;
 import  com.alibaba.dashscope.utils.Constants;
 import  com.google.gson.Gson;
 import  com.google.gson.JsonObject;

 import  java.io.*;
 import  java.net.HttpURLConnection;
 import  java.net.URL;
 import  java.nio.file.*;
 import  java.nio.charset.StandardCharsets;
 import  java.util.Base64;

 public class Main  {
     // ===== Constant definitions ===== // Use the same model for voice cloning and speech synthesis private static final String TARGET_MODEL = "qwen3-tts-vc-2026-01-22" ;
     private static final String PREFERRED_NAME = "guanyu" ;
     // Relative path to the local audio file used for voice cloning private static final String AUDIO_FILE = "voice.mp3" ;
     private static final String AUDIO_MIME_TYPE = "audio/mpeg" ;

     // Generate a data URI public static  String  toDataUrl (String filePath) throws  IOException {
         byte [] bytes = Files.readAllBytes(Paths.get(filePath));
         String encoded =  Base64.getEncoder().encodeToString(bytes);
         return "data:"  + AUDIO_MIME_TYPE +  ";base64,"  + encoded;
    }

     // Call the API to create a voice public static  String  createVoice () throws  Exception {
         // API keys differ between the Singapore and Beijing regions. To obtain an API key, see https://www.alibabacloud.com/help/zh/model-studio/get-api-key // If you haven't configured an environment variable, replace the following line with: String apiKey = "sk-xxx" String apiKey =  System.getenv( "DASHSCOPE_API_KEY" );

         String jsonPayload = "{" 
                        +  "\"model\": \"qwen-voice-enrollment\"," // Do not change this value 
                        +  "\"input\": {" 
                        +      "\"action\": \"create\"," 
                        +      "\"target_model\": \""  + TARGET_MODEL +  "\"," 
                        +      "\"preferred_name\": \""  + PREFERRED_NAME +  "\"," 
                        +      "\"audio\": {" 
                        +          "\"data\": \""  + toDataUrl(AUDIO_FILE) +  "\"" 
                        +      "}" 
                        +  "}" 
                        +  "}" ;

         // Singapore region endpoint. For the Beijing region, use: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization String url = "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization" ;
         HttpURLConnection con =  (HttpURLConnection)  new URL (url).openConnection();
        con.setRequestMethod( "POST" );
        con.setRequestProperty( "Authorization" ,  "Bearer "  + apiKey);
        con.setRequestProperty( "Content-Type" ,  "application/json" );
        con.setDoOutput( true );

         try  ( OutputStream os =  con.getOutputStream()) {
            os.write(jsonPayload.getBytes(StandardCharsets.UTF_8));
        }

         int status =  con.getResponseCode();
        System.out.println( "HTTP status code: "  + status);

         try  ( BufferedReader br = new BufferedReader (
                 new InputStreamReader (status >=  200  && status <  300  ? con.getInputStream() : con.getErrorStream(),
                        StandardCharsets.UTF_8))) {
             StringBuilder response = new StringBuilder ();
            String line;
             while  ((line = br.readLine()) !=  null ) {
                response.append(line);
            }
            System.out.println( "Response content: "  + response);

             if  (status ==  200 ) {
                 JsonObject jsonObj = new Gson ().fromJson(response.toString(), JsonObject.class);
                 return  jsonObj.getAsJsonObject( "output" ).get( "voice" ).getAsString();
            }
             throw new IOException ( "Failed to create voice: "  + status +  " - "  + response);
        }
    }

     public static void call () throws  Exception {
         MultiModalConversation conv = new MultiModalConversation ();
         MultiModalConversationParam param =  MultiModalConversationParam.builder()
                 // API keys differ between the Singapore and Beijing regions. To obtain an API key, see https://www.alibabacloud.com/help/zh/model-studio/get-api-key // If you haven't configured an environment variable, replace the following line with: .apikey("sk-xxx") 
                .apiKey(System.getenv( "DASHSCOPE_API_KEY" ))
                .model(TARGET_MODEL)
                .text( "How's the weather today?" )
                .parameter( "voice" , createVoice())  // Replace the voice parameter with the custom voice generated by cloning 
                .build();
         MultiModalConversationResult result =  conv.call(param);
         String audioUrl =  result.getOutput().getAudio().getUrl();
        System.out.print(audioUrl);

         // Download the audio file locally try  ( InputStream in = new URL (audioUrl).openStream();
              FileOutputStream out = new FileOutputStream ( "downloaded_audio.wav" )) {
             byte [] buffer =  new byte [ 1024 ];
             int  bytesRead;
             while  ((bytesRead = in.read(buffer)) != - 1 ) {
                out.write(buffer,  0 , bytesRead);
            }
            System.out.println( "\nAudio file downloaded locally: downloaded_audio.wav" );
        }  catch  (Exception e) {
            System.out.println( "\nError downloading audio file: "  + e.getMessage());
        }
    }
     public static void main (String[] args)  {
         try  {
             // Singapore region endpoint. For the Beijing region, use: https://dashscope.aliyuncs.com/api/v1 
            Constants.baseHttpApiUrl =  "https://dashscope-intl.aliyuncs.com/api/v1" ;
            call();
        }  catch  (Exception e) {
            System.out.println(e.getMessage());
        }
        System.exit( 0 );
    }
}
```

## **API reference**

Use the same account for all API calls.

### **Create voice**

Upload audio to clone and create a custom voice.

* **URL**
  
  Chinese mainland:
  
  ```
  POST https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization
  ```
  
  International:
  
  ```
  POST https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization
  ```
* **Request headers**
  
  |**Parameter** |**Type** |**Required** |**Description** |
  | --- | --- | --- | --- |
  
  
  |**Parameter** |**Type** |**Required** |**Description** |
  | --- | --- | --- | --- |
  |Authorization |string |Supported |Authentication token, formatted as `Bearer <your_api_key>` . Replace `<your_api_key>` with your actual API key. |
  |Content-Type |string |Supported |Media type of data transmitted in the request body. Fixed value: `application/json` . |
* **Request body**
  
  The request body includes all parameters. You can omit optional fields as needed.
  
  **Important**
  
  Note the distinction between these parameters:
  
    + `model` : The voice cloning model. The value is fixed as `qwen-voice-enrollment` .
    + `target_model` : The speech synthesis model that determines the voice characteristics. This model must be the same as the speech synthesis model used in subsequent calls to the speech synthesis API. Otherwise, the synthesis will fail.
  
  ```
  { "model" : "qwen-voice-enrollment" , "input" : { "action" : "create" , "target_model" : "qwen3-tts-vc-realtime-2026-01-15" , "preferred_name" : "guanyu" , "audio" : { "data" : "https://xxx.wav" } , "text" : "Optional. Enter the text corresponding to audio.data." , "language" : "Optional. Enter the language of audio.data, such as zh." } }
  ```
* **Request parameters**
  
  |**Parameter** |**Type** |**Default** |**Required** |**Description** |
  | --- | --- | --- | --- | --- |
  
  
  |**Parameter** |**Type** |**Default** |**Required** |**Description** |
  | --- | --- | --- | --- | --- |
  |model |string |\- |Supported |Voice cloning model. Fixed as `qwen-voice-enrollment` . |
  |action |string |\- |Supported |Action type. Fixed value: `create` . |
  |target\_model |string |\- |Supported |Speech synthesis models driven by cloned voices are available in two types:
  
    + **Qwen3-TTS-VC-Realtime** (see Real-time speech synthesis - Qwen ):
        
        - qwen3-tts-vc-realtime-2026-01-15
        - qwen3-tts-vc-realtime-2025-11-27
    + **Qwen3-TTS-VC** (see Speech synthesis - Qwen ):
        
        - qwen3-tts-vc-2026-01-22
  
  Must match the speech synthesis model used in subsequent speech synthesis API calls. Otherwise, synthesis fails. |
  |preferred\_name |string |\- |Supported |A recognizable name for the voice (up to 16 characters: digits, letters, and underscores only). We recommend choosing a name related to the role or scenario.
  
  > This keyword appears in the cloned voice name. For example, if the keyword is guanyu, the final voice name is qwen-tts-vc-guanyu-voice-20250812105009984-838b. |
  |audio.data |string |\- |Supported |Audio for cloning (recorded according to the Recording guide and meeting the Audio requirements ).
  
  Submit audio data in one of two ways:
  
    1. [Data URL](https://www.rfc-editor.org/rfc/rfc2397)
         
         Format: `data:<mediatype>;base64,<data>`
         
        - `<mediatype>` : MIME type
                   
            * WAV: `audio/wav`
            * MP3: `audio/mpeg`
            * M4A: `audio/mp4`
        - `<data>` : The Base64-encoded string of the audio data.
                   
                   Base64 encoding increases file size. Keep the original file small enough so the encoded version stays under 10 MB.
        - Example: `data:audio/wav;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//PAxABQ/BXRbMPe4IQAhl9`
                   
                   **View sample code**
                   
                   Python
                   
                   Java
                   
                   Python
                   
                   ```
                   import  base64, pathlib
                   
                    # input.mp3 is a local audio file used for voice cloning. Replace it with the path to your audio file and ensure the file meets the audio requirements. 
                   file_path = pathlib.Path( "input.mp3" )
                   base64_str = base64.b64encode(file_path.read_bytes()).decode()
                   data_uri =  f"data:audio/mpeg;base64, {base64_str} "
                   ```
                   
                   Java
                   
                   ```
                   import  java.nio.file.*;
                    import  java.util.Base64;
                   
                    public class Main  {
                        /**
     * filePath is the local audio file used for voice cloning. Replace this with the path to your own audio file, and ensure that it meets the audio requirements.
                        */ public static  String  toDataUrl (String filePath) throws  Exception {
                            byte [] bytes = Files.readAllBytes(Paths.get(filePath));
                            String encoded =  Base64.getEncoder().encodeToString(bytes);
                            return "data:audio/mpeg;base64,"  + encoded;
                       }
                   
                        // Usage example public static void main (String[] args) throws  Exception {
                           System.out.println(toDataUrl( "input.mp3" ));
                       }
                   }
                   ```
    2. Audio URL (Recommended for audio: upload to OSS )
         
        - File size ≤ 10 MB
        - URL must be publicly accessible and require no authentication |
  |text |string |\- |No |Text that matches the audio content of `audio.data` .
  
  If provided, the server compares the audio with this text. If they differ significantly, the server returns Audio.PreprocessError. |
  |language |string |\- |Not supported |Language of the `audio.data` audio.
  
  Supported languages include `zh` (Chinese), `en` (English), `de` (German), `it` (Italian), `pt` (Portuguese), `es` (Spanish), `ja` (Japanese), `ko` (Korean), `fr` (French), `ru` (Russian).
  
  If used, the language must match the actual language of the audio used for cloning. |
* **Response parameters**
  
  **View response example**
  
  ```
  { "output" : { "voice" : "yourVoice" , "target_model" : "qwen3-tts-vc-realtime-2026-01-15" } , "usage" : { "count" : 1 } , "request_id" : "yourRequestId" }
  ```
  
  Key parameters:
  
  |**Parameter** |**Type** |**Description** |
  | --- | --- | --- |
  
  
  |**Parameter** |**Type** |**Description** |
  | --- | --- | --- |
  |voice |string |Voice name. Use as the `voice` parameter in speech synthesis APIs. |
  |target\_model |string |Speech synthesis models driven by cloned voices are available in two types:
  
    + **Qwen3-TTS-VC-Realtime** (see Real-time speech synthesis - Qwen ):
        
        - qwen3-tts-vc-realtime-2026-01-15
        - qwen3-tts-vc-realtime-2025-11-27
    + **Qwen3-TTS-VC** (see Speech synthesis - Qwen ):
        
        - qwen3-tts-vc-2026-01-22
  
  Must match the speech synthesis model used in subsequent speech synthesis API calls. Otherwise, synthesis fails. |
  |request\_id |string |Request ID. |
  |count |integer |This request is charged based on the actual number of 'Create Voice' operations. The cost for this request is $ co u n t × 0\.01 .
  
  For voice creation, count is always 1. |
* **Sample code**
  
  **Important**
  
  Note the distinction between these parameters:
  
    + `model` : The voice cloning model. The value is fixed as `qwen-voice-enrollment` .
    + `target_model` : The speech synthesis model that determines the voice characteristics. This model must be the same as the speech synthesis model used in subsequent calls to the speech synthesis API. Otherwise, the synthesis will fail.
  
  cURL
  
  Python
  
  Java
  
  If you have not set the API key as an environment variable, you must replace `$DASHSCOPE_API_KEY` in the example with your actual API key.
  
  ```
  https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization# ======= Important Notes =======
  # The following URL is for the Singapore region. If you use a model in the Beijing region, replace the URL with: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization
  # The API key for the Singapore region differs from that for the Beijing region. To obtain an API key, see: https://www.alibabacloud.com/help/zh/model-studio/get-api-key
  # === Delete this comment before execution ===
  
   curl -X  POST  <a data -init-id= "9f104f338c7kz"  href= "https://poc-dashscope.aliyuncs.com/api/v1/services/audio/tts/customization"  id= "35ebbc67890ds" >https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization</a> \
   -H "Authorization: Bearer $DASHSCOPE_API_KEY"  \
   -H "Content-Type: application/json"  \
   -d '{
      "model": "qwen-voice-enrollment",
      "input": {
          "action": "create",
          "target_model": "qwen3-tts-vc-realtime-2026-01-15",
          "preferred_name": "guanyu",
          "audio": {
              "data": "https://xxx.wav"
          }
      }
  }'
  ```
  
  ```
  import  os
   import  requests
   import  base64, pathlib
  
  target_model =  "qwen3-tts-vc-realtime-2026-01-15" 
  preferred_name =  "guanyu" 
  audio_mime_type =  "audio/mpeg" 
  
  file_path = pathlib.Path( "input.mp3" )
  base64_str = base64.b64encode(file_path.read_bytes()).decode()
  data_uri =  f"data: {audio_mime_type} ;base64, {base64_str} " # API keys differ between the Singapore and Beijing regions. To obtain an API key, see https://www.alibabacloud.com/help/zh/model-studio/get-api-key # If you have not configured an environment variable, replace the following line with your Model Studio API key: api_key = "sk-xxx" 
  api_key = os.getenv( "DASHSCOPE_API_KEY" )
   # The following URL is for the Singapore region. If you use a model in the Beijing region, replace the URL with: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization 
  url =  "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization" 
  
  payload = {
       "model" :  "qwen-voice-enrollment" ,  # Do not change this value "input" : {
           "action" :  "create" ,
           "target_model" : target_model,
           "preferred_name" : preferred_name,
           "audio" : {
               "data" : data_uri
          }
      }
  }
  
  headers = {
       "Authorization" :  f"Bearer  {api_key} " ,
       "Content-Type" :  "application/json" 
  }
  
   # Send POST request 
  resp = requests.post(url, json=payload, headers=headers)
  
   if  resp.status_code ==  200 :
      data = resp.json()
      voice = data[ "output" ][ "voice" ]
       print ( f"Generated voice parameter:  {voice} " )
   else :
       print ( "Request failed:" , resp.status_code, resp.text)
  ```
  
  ```
  import  com.google.gson.Gson;
   import  com.google.gson.JsonObject;
  
   import  java.io.*;
   import  java.net.HttpURLConnection;
   import  java.net.URL;
   import  java.nio.file.*;
   import  java.util.Base64;
  
   public class Main  {
       private static final String TARGET_MODEL = "qwen3-tts-vc-realtime-2026-01-15" ;
       private static final String PREFERRED_NAME = "guanyu" ;
       private static final String AUDIO_FILE = "input.mp3" ;
       private static final String AUDIO_MIME_TYPE = "audio/mpeg" ;
  
       public static  String  toDataUrl (String filePath) throws  Exception {
           byte [] bytes = Files.readAllBytes(Paths.get(filePath));
           String encoded =  Base64.getEncoder().encodeToString(bytes);
           return "data:"  + AUDIO_MIME_TYPE +  ";base64,"  + encoded;
      }
  
       public static void main (String[] args)  {
           // The API keys for the Singapore and Beijing regions are different. To obtain an API key, visit: https://www.alibabacloud.com/help/en/model-studio/get-api-key // If you have not configured the environment variable, replace the following line with your Model Studio API key: String apiKey = "sk-xxx" String apiKey =  System.getenv( "DASHSCOPE_API_KEY" );
           // The following URL is for the Singapore region. If you use a model in the Beijing region, replace the URL with: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization String apiUrl = "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization" ;
  
           try  {
               // Construct the JSON request body. Note that internal quotation marks must be escaped. String jsonPayload = "{" 
                            +  "\"model\": \"qwen-voice-enrollment\"," // Do not change this value. 
                            +  "\"input\": {" 
                            +      "\"action\": \"create\"," 
                            +      "\"target_model\": \""  + TARGET_MODEL +  "\"," 
                            +      "\"preferred_name\": \""  + PREFERRED_NAME +  "\"," 
                            +      "\"audio\": {" 
                            +          "\"data\": \""  + toDataUrl(AUDIO_FILE) +  "\"" 
                            +      "}" 
                            +  "}" 
                            +  "}" ;
  
               HttpURLConnection con =  (HttpURLConnection)  new URL (apiUrl).openConnection();
              con.setRequestMethod( "POST" );
              con.setRequestProperty( "Authorization" ,  "Bearer "  + apiKey);
              con.setRequestProperty( "Content-Type" ,  "application/json" );
              con.setDoOutput( true );
  
               // Send the request body. try  ( OutputStream os =  con.getOutputStream()) {
                  os.write(jsonPayload.getBytes( "UTF-8" ));
              }
  
               int status =  con.getResponseCode();
               InputStream is =  (status >=  200  && status <  300 )
                      ? con.getInputStream()
                      : con.getErrorStream();
  
               StringBuilder response = new StringBuilder ();
               try  ( BufferedReader br = new BufferedReader ( new InputStreamReader (is,  "UTF-8" ))) {
                  String line;
                   while  ((line = br.readLine()) !=  null ) {
                      response.append(line);
                  }
              }
  
              System.out.println( "HTTP status code: "  + status);
              System.out.println( "Response content: "  + response.toString());
  
               if  (status ==  200 ) {
                   // Parse the JSON. Gson gson = new Gson ();
                   JsonObject jsonObj =  gson.fromJson(response.toString(), JsonObject.class);
                   String voice =  jsonObj.getAsJsonObject( "output" ).get( "voice" ).getAsString();
                  System.out.println( "Generated voice parameter: "  + voice);
              }
  
          }  catch  (Exception e) {
              e.printStackTrace();
          }
      }
  }
  ```

### **List voices**

Query a paginated list of your created voices.

* **URL**
  
  Chinese mainland:
  
  ```
  POST https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization
  ```
  
  International:
  
  ```
  POST https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization
  ```
* **Request headers**
  
  |**Parameter** |**Type** |**Required** |**Description** |
  | --- | --- | --- | --- |
  
  
  |**Parameter** |**Type** |**Required** |**Description** |
  | --- | --- | --- | --- |
  |Authorization |string |Supported |Authentication token, formatted as `Bearer <your_api_key>` . Replace `<your_api_key>` with your actual API key. |
  |Content-Type |string |Supported |Media type of data transmitted in the request body. Fixed value: `application/json` . |
* **Request body**
  
  The request body includes all parameters. You can omit optional fields as needed.
  
  **Important**
  
  `model` : The voice cloning model. The value is fixed as `qwen-voice-enrollment` . Do not modify this value.
  
  ```
  { "model" : "qwen-voice-enrollment" , "input" : { "action" : "list" , "page_size" : 2 , "page_index" : 0 } }
  ```
* **Request parameters**
  
  |**Parameter** |**Type** |**Default** |**Required** |**Description** |
  | --- | --- | --- | --- | --- |
  
  
  |**Parameter** |**Type** |**Default** |**Required** |**Description** |
  | --- | --- | --- | --- | --- |
  |model |string |\- |Supported |Voice cloning model. Fixed as `qwen-voice-enrollment` . |
  |action |string |\- |Supported |Action type. Fixed value: `list` . |
  |page\_index |integer |0 |No |Page number (0-indexed). Range: [0, 1000000]. |
  |page\_size |integer |10 |Not supported |Results per page. Range: [0, 1000000]. |
* **Response parameters**
  
  **View response example**
  
  ```
  { "output" : { "voice_list" : [ { "voice" : "yourVoice1" , "gmt_create" : "2025-08-11 17:59:32" , "target_model" : "qwen3-tts-vc-realtime-2026-01-15" } , { "voice" : "yourVoice2" , "gmt_create" : "2025-08-11 17:38:10" , "target_model" : "qwen3-tts-vc-realtime-2026-01-15" } ] } , "usage" : { "count" : 0 } , "request_id" : "yourRequestId" }
  ```
  
  Key parameters:
  
  |**Parameter** |**Type** |**Description** |
  | --- | --- | --- |
  
  
  |**Parameter** |**Type** |**Description** |
  | --- | --- | --- |
  |voice |string |Voice name. Use as the `voice` parameter in speech synthesis APIs. |
  |gmt\_create |string |Time when the voice was created. |
  |target\_model |string |Speech synthesis models driven by cloned voices are available in two types:
  
    + **Qwen3-TTS-VC-Realtime** (see Real-time speech synthesis - Qwen ):
        
        - qwen3-tts-vc-realtime-2026-01-15
        - qwen3-tts-vc-realtime-2025-11-27
    + **Qwen3-TTS-VC** (see Speech synthesis - Qwen ):
        
        - qwen3-tts-vc-2026-01-22
  
  Must match the speech synthesis model used in subsequent speech synthesis API calls. Otherwise, synthesis fails. |
  |request\_id |string |Request ID. |
  |count | |This request is charged based on the actual number of 'Create Voice' operations. The cost for this request is $ co u n t × 0\.01 .
  
  Querying voices is not billed, therefore the `count` is always 0. |
* **Sample code**
  
  **Important**
  
  `model` : The voice cloning model. The value is fixed as `qwen-voice-enrollment` . Do not modify this value.
  
  cURL
  
  Python
  
  Java
  
  If you have not set the API key as an environment variable, you must replace `$DASHSCOPE_API_KEY` in the example with your actual API key.
  
  ```
  # ======= Important notes =======
  # The following URL is for the Singapore region. If you use a model in the Beijing region, replace the URL with: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization
  # The API key for the Singapore region differs from that for the Beijing region. To obtain an API key, see: https://www.alibabacloud.com/help/zh/model-studio/get-api-key
  # === Delete this comment before execution ===
  
   curl --location --request  POST 'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization'  \
   --header 'Authorization: Bearer $DASHSCOPE_API_KEY'  \
   --header 'Content-Type: application/json'  \
   --data '{
      "model": "qwen-voice-enrollment",
      "input": {
          "action": "list",
          "page_size": 10,
          "page_index": 0
      }
  }'
  ```
  
  ```
  import  os
   import  requests
  
   # The API keys for the Singapore and Beijing regions are different. To get an API key, visit: https://www.alibabacloud.com/help/en/model-studio/get-api-key # If you have not configured the environment variable, replace the following line with your Model Studio API key: api_key = "sk-xxx" 
  api_key = os.getenv( "DASHSCOPE_API_KEY" )
   # The URL for the Singapore region. To use a model in the Beijing region, replace the URL with: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization 
  url =  "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization" 
  
  payload = {
       "model" :  "qwen-voice-enrollment" ,  # Do not modify this value "input" : {
           "action" :  "list" ,
           "page_size" :  10 ,
           "page_index" :  0 
      }
  }
  
  headers = {
       "Authorization" :  f"Bearer  {api_key} " ,
       "Content-Type" :  "application/json" 
  }
  
  response = requests.post(url, json=payload, headers=headers)
  
   print ( "HTTP status code:" , response.status_code)
  
   if  response.status_code ==  200 :
      data = response.json()
      voice_list = data[ "output" ][ "voice_list" ]
  
       print ( "List of voices found:" )
       for  item  in  voice_list:
           print ( f"- Voice:  {item[ 'voice' ]}   Creation time:  {item[ 'gmt_create' ]}   Model:  {item[ 'target_model' ]} " )
   else :
       print ( "Request failed:" , response.text)
  ```
  
  ```
  import  com.google.gson.Gson;
   import  com.google.gson.JsonArray;
   import  com.google.gson.JsonObject;
  
   import  java.io.BufferedReader;
   import  java.io.InputStreamReader;
   import  java.io.OutputStream;
   import  java.net.HttpURLConnection;
   import  java.net.URL;
  
   public class Main  {
       public static void main (String[] args)  {
           // API keys differ between the Singapore and Beijing regions. To obtain an API key, see https://www.alibabacloud.com/help/zh/model-studio/get-api-key // If you have not configured an environment variable, replace the following line with your Model Studio API key: String apiKey = "sk-xxx" String apiKey =  System.getenv( "DASHSCOPE_API_KEY" );
           // The following endpoint is for the Singapore region. For the Beijing region, use: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization String apiUrl = "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization" ;
  
           // JSON request body (earlier versions of Java do not support multi-line strings using triple quotes (""")) String jsonPayload = "{" 
                        +  "\"model\": \"qwen-voice-enrollment\"," // Do not change this value 
                        +  "\"input\": {" 
                        +      "\"action\": \"list\"," 
                        +      "\"page_size\": 10," 
                        +      "\"page_index\": 0" 
                        +  "}" 
                        +  "}" ;
  
           try  {
               HttpURLConnection con =  (HttpURLConnection)  new URL (apiUrl).openConnection();
              con.setRequestMethod( "POST" );
              con.setRequestProperty( "Authorization" ,  "Bearer "  + apiKey);
              con.setRequestProperty( "Content-Type" ,  "application/json" );
              con.setDoOutput( true );
  
               try  ( OutputStream os =  con.getOutputStream()) {
                  os.write(jsonPayload.getBytes( "UTF-8" ));
              }
  
               int status =  con.getResponseCode();
               BufferedReader br = new BufferedReader ( new InputStreamReader (
                      status >=  200  && status <  300  ? con.getInputStream() : con.getErrorStream(),  "UTF-8" ));
  
               StringBuilder response = new StringBuilder ();
              String line;
               while  ((line = br.readLine()) !=  null ) {
                  response.append(line);
              }
              br.close();
  
              System.out.println( "HTTP status code: "  + status);
              System.out.println( "Response JSON: "  + response.toString());
  
               if  (status ==  200 ) {
                   Gson gson = new Gson ();
                   JsonObject jsonObj =  gson.fromJson(response.toString(), JsonObject.class);
                   JsonArray voiceList =  jsonObj.getAsJsonObject( "output" ).getAsJsonArray( "voice_list" );
  
                  System.out.println( "\n List of voices found:" );
                   for  ( int i = 0 ; i < voiceList.size(); i++) {
                       JsonObject voiceItem =  voiceList.get(i).getAsJsonObject();
                       String voice =  voiceItem.get( "voice" ).getAsString();
                       String gmtCreate =  voiceItem.get( "gmt_create" ).getAsString();
                       String targetModel =  voiceItem.get( "target_model" ).getAsString();
  
                      System.out.printf( "- Voice: %s  Creation time: %s  Model: %s\n" ,
                              voice, gmtCreate, targetModel);
                  }
              }
  
          }  catch  (Exception e) {
              e.printStackTrace();
          }
      }
  }
  ```

### **Delete voice**

Delete a voice to release its quota.

* **URL**
  
  Chinese mainland:
  
  ```
  POST https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization
  ```
  
  International:
  
  ```
  POST https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization
  ```
* **Request headers**
  
  |**Parameter** |**Type** |**Required** |**Description** |
  | --- | --- | --- | --- |
  
  
  |**Parameter** |**Type** |**Required** |**Description** |
  | --- | --- | --- | --- |
  |Authorization |string |Supported |Authentication token, formatted as `Bearer <your_api_key>` . Replace `<your_api_key>` with your actual API key. |
  |Content-Type |string |Supported |Media type of data transmitted in the request body. Fixed value: `application/json` . |
* **Request body**
  
  The request body includes all parameters. You can omit optional fields as needed.
  
  **Important**
  
  `model` : The voice cloning model. The value is fixed as `qwen-voice-enrollment` . Do not modify this value.
  
  ```
  { "model" : "qwen-voice-enrollment" , "input" : { "action" : "delete" , "voice" : "yourVoice" } }
  ```
* **Request parameters**
  
  |**Parameter** |**Type** |**Default** |**Required** |**Description** |
  | --- | --- | --- | --- | --- |
  
  
  |**Parameter** |**Type** |**Default** |**Required** |**Description** |
  | --- | --- | --- | --- | --- |
  |model |string |\- |Yes |Voice cloning model. Fixed as `qwen-voice-enrollment` . |
  |action |string |\- |Supported |Action type. Fixed value: `delete` . |
  |voice |string |\- |Supported |Voice to delete. |
* **Response parameters**
  
  **View response example**
  
  ```
  { "usage" : { "count" : 0 } , "request_id" : "yourRequestId" }
  ```
  
  Key parameters:
  
  |**Parameter** |**Type** |**Description** |
  | --- | --- | --- |
  
  
  |**Parameter** |**Type** |**Description** |
  | --- | --- | --- |
  |request\_id |string |Request ID. |
  |count |integer |This request is charged based on the actual number of 'Create Voice' operations. The cost for this request is $ co u n t × 0\.01 .
  
  Deleting voices is free. Therefore, `count` is always 0. |
* **Sample code**
  
  **Important**
  
  `model` : The voice cloning model. The value is fixed as `qwen-voice-enrollment` . Do not modify this value.
  
  cURL
  
  Python
  
  Java
  
  If you have not set the API key as an environment variable, you must replace `$DASHSCOPE_API_KEY` in the example with your actual API key.
  
  ```
  # ======= Important Note =======
  # The following URL is for the Singapore region. If you use a model in the Beijing region, you must replace the URL with: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization
  # The API keys for the Singapore and Beijing regions are different. To obtain an API key, visit: https://www.alibabacloud.com/help/en/model-studio/get-api-key
  # === Delete this comment before execution. ===
  
   curl --location --request  POST 'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization'  \
   --header 'Authorization: Bearer $DASHSCOPE_API_KEY'  \
   --header 'Content-Type: application/json'  \
   --data '{
      "model": "qwen-voice-enrollment",
      "input": {
          "action": "delete",
          "voice": "yourVoice"
      }
  }'
  ```
  
  ```
  import  os
   import  requests
  
  api_key = os.getenv( "DASHSCOPE_API_KEY" )
   # Singapore region endpoint. For the Beijing region, use: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization 
  url =  "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization" 
  
  voice_to_delete =  "yourVoice" # Voice to delete (replace with actual value) 
  
  payload = {
       "model" :  "qwen-voice-enrollment" ,  # Do not change this value "input" : {
           "action" :  "delete" ,
           "voice" : voice_to_delete
      }
  }
  
  headers = {
       "Authorization" :  f"Bearer  {api_key} " ,
       "Content-Type" :  "application/json" 
  }
  
  response = requests.post(url, json=payload, headers=headers)
  
   print ( "HTTP status code:" , response.status_code)
  
   if  response.status_code ==  200 :
      data = response.json()
      request_id = data[ "request_id" ]
  
       print ( f"Deletion successful" )
       print ( f"Request ID:  {request_id} " )
   else :
       print ( "Request failed:" , response.text)
  ```
  
  ```
  import  com.google.gson.Gson;
   import  com.google.gson.JsonObject;
  
   import  java.io.BufferedReader;
   import  java.io.InputStreamReader;
   import  java.io.OutputStream;
   import  java.net.HttpURLConnection;
   import  java.net.URL;
  
   public class Main  {
       public static void main (String[] args)  {
           // The API keys for the Singapore and Beijing regions differ. To obtain an API key, see https://www.alibabacloud.com/help/zh/model-studio/get-api-key // If you have not configured an environment variable, replace the following line with your Model Studio API key: String apiKey = "sk-xxx" String apiKey =  System.getenv( "DASHSCOPE_API_KEY" );
           // Singapore region endpoint. For the Beijing region, use: https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization String apiUrl = "https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/customization" ;
           String voiceToDelete = "yourVoice" ;  // Voice to delete (replace with actual value) // Construct the JSON request body (string concatenation, compatible with Java 8) String jsonPayload = "{" 
                        +  "\"model\": \"qwen-voice-enrollment\"," // Do not change this value 
                        +  "\"input\": {" 
                        +      "\"action\": \"delete\"," 
                        +      "\"voice\": \""  + voiceToDelete +  "\"" 
                        +  "}" 
                        +  "}" ;
  
           try  {
               // Establish a POST connection HttpURLConnection con =  (HttpURLConnection)  new URL (apiUrl).openConnection();
              con.setRequestMethod( "POST" );
              con.setRequestProperty( "Authorization" ,  "Bearer "  + apiKey);
              con.setRequestProperty( "Content-Type" ,  "application/json" );
              con.setDoOutput( true );
  
               // Send the request body try  ( OutputStream os =  con.getOutputStream()) {
                  os.write(jsonPayload.getBytes( "UTF-8" ));
              }
  
               int status =  con.getResponseCode();
               BufferedReader br = new BufferedReader ( new InputStreamReader (
                      status >=  200  && status <  300  ? con.getInputStream() : con.getErrorStream(),  "UTF-8" ));
  
               StringBuilder response = new StringBuilder ();
              String line;
               while  ((line = br.readLine()) !=  null ) {
                  response.append(line);
              }
              br.close();
  
              System.out.println( "HTTP status code: "  + status);
              System.out.println( "Response JSON: "  + response.toString());
  
               if  (status ==  200 ) {
                   Gson gson = new Gson ();
                   JsonObject jsonObj =  gson.fromJson(response.toString(), JsonObject.class);
                   String requestId =  jsonObj.get( "request_id" ).getAsString();
  
                  System.out.println( "Deletion successful" );
                  System.out.println( "Request ID: "  + requestId);
              }
  
          }  catch  (Exception e) {
              e.printStackTrace();
          }
      }
  }
  ```

### **Speech synthesis**

To synthesize audio with a custom voice generated by voice cloning, see Getting started: From cloning to synthesis .

**Voice cloning speech synthesis models, such as qwen3-tts-vc-realtime-2026-01-15, are dedicated models. They support only cloned voices and do not support system voices such as Chelsie, Serena, Ethan, or Cherry.**

## **Voice quota and automatic cleanup rules**

* **Quota limit** : 1,000 voices per account.
  
  > This API does not provide a feature to query the total number of voices. Call the List voices API and count the voices yourself.
* **Automatic cleanup** : Voices unused for over one year are automatically deleted.

## **Billing**

Voice cloning and speech synthesis are billed separately:

* Voice cloning: The Create voice operation is billed at $0.01 per instance . Failed creations are not billed.
  
  **Note**
  
  Free quota details (available only for the China (Beijing) region on the Alibaba Cloud China site and the Singapore region on the Alibaba Cloud International site):
  
    + You receive 1,000 free voice creation attempts within 90 days of activating Model Studio.
    + Failed creations do not consume free attempts.
    + Deleting voices does not restore free attempts.
    + After the free quota is exhausted or the 90-day validity period expires, creating voice clones is billed at USD 0.01 per voice clone .
* Speech synthesis that uses a custom voice generated by cloning is billed per character. See Real-time speech synthesis – Qwen or Speech synthesis – Qwen .

## **Copyright and legality**

Make sure you own or have the legal rights to use any voice that you provide. Before you use this API, read the [Terms of Service](https://terms.alicdn.com/legal-agreement/terms/b_platform_service_agreement/20240229113512917/20240229113512917.html) .

## Recording guide

### **Recording device**

We recommend using a noise-canceling microphone or recording with a smartphone at close range in a quiet environment to ensure clean audio.

### **Recording environment**

#### **Location**

* Record in a small, enclosed space of 10 m² or less.
* Choose rooms with sound-absorbing materials, such as acoustic foam, carpets, or curtains.
* Avoid large, reverberant spaces, such as halls, meeting rooms, or classrooms.

#### **Noise control**

* Outdoor noise: Close windows and doors to block traffic, construction, and other external interference.
* Indoor noise: Turn off air conditioners, fans, fluorescent lamp ballasts, and other similar devices. You can record the ambient noise with your phone at a high volume to identify hidden noise sources.

#### **Reverberation control**

* Reverberation causes muffled, unclear audio.
* Reduce reflections from smooth surfaces: Draw curtains, open closet doors, and cover tables or cabinets with clothing or sheets.
* Use irregular objects such as bookshelves or upholstered furniture to diffuse sound.

### **Script**

* The script content is flexible. We recommend that you align the script with your target use case. For example, use a customer service dialogue style for support scenarios. However, make sure the script does not contain sensitive or illegal content, such as political, pornographic, or violent material. Otherwise, the cloning will fail.
* Avoid short phrases, such as "Hello" or "Yes". Use complete sentences instead.
* Maintain semantic continuity. Avoid frequent pauses while reading. Aim for at least 3 seconds of continuous speech.
* You can include target emotions, such as friendly or serious, but avoid an overly dramatic delivery. Keep the delivery natural.

### **Operational tips**

Example (typical bedroom):

1. Close windows and doors to block external noise.
2. Turn off air conditioners, fans, and other electrical appliances.
3. Draw curtains to reduce glass reflections.
4. Cover desks or tables with clothing or blankets to reduce reflections.
5. Familiarize yourself with the script, set the character’s tone, and deliver naturally.
6. Maintain a distance of approximately 10 cm from the recording device to avoid plosives or weak signals.

## **Error messages**

If you encounter errors, see the error messages documentation for troubleshooting.

Previous: Interaction flow for real-time speech synthesis Next: Qwen voice design

Is this page helpful?

Feedback

* On this page （1）
* 
* Audio requirements

* 
* Getting started: From cloning to synthesis

* 
* 1\. Workflow

* 
* 2\. Model configuration and preparations

* 
* 3\. Sample code

* 
* API reference

* 
* Create voice

* 
* List voices

* 
* Delete voice

* 
* Speech synthesis

* 
* Voice quota and automatic cleanup rules

* 
* Billing

* 
* Copyright and legality

* 
* Recording guide

* 
* Recording device

* 
* Recording environment

* 
* Script

* 
* Operational tips

* 
* Error messages

[Careers](https://careers.aliyun.com/en/home) [About Us](https://www.alibabacloud.com/about) [Privacy Policy](https://www.alibabacloud.com/help/faq-detail/42425.htm) [Legal](https://www.alibabacloud.com/help/en/legal) [Integrity Compliance Reporting Channel](https://aliyun.jubao.alibaba.com) [Service Notices](https://www.alibabacloud.com/notice/intl/list) [Links](https://www.alibabacloud.com/links.html)

[Careers](https://careers.aliyun.com/en/home) [About Us](https://www.alibabacloud.com/about) [Privacy Policy](https://www.alibabacloud.com/help/faq-detail/42425.htm) [Legal](https://www.alibabacloud.com/help/en/legal) [Integrity Compliance Reporting Channel](https://aliyun.jubao.alibaba.com) [Service Notices](https://www.alibabacloud.com/notice/intl/list) [Links](https://www.alibabacloud.com/links.html)

phone Contact Us

Chat now with **Alibaba Cloud Customer Service** to assist you in finding the right products and services to meet your needs.

alicare alicare [alicare](https://www.alibabacloud.com/ccim/mobile) [alicare](https://int.alibabacloud.com/m/1000409525/) [alicare](https://wa.me/8613811961093)

[Hi, I'm Alibaba Cloud AI Assistant! I can help with questions and solutions.](https://www.alibabacloud.com/ai-assistant?displayMode=widget)