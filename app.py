import streamlit as st
import pandas as pd
import random
from recommender import get_recommendations

# --- CONFIGURAZIONE PAGINA ---
st.set_page_config(page_title="CrowdLoop AI", layout="wide", initial_sidebar_state="expanded")

@st.cache_data
def load_data():
    return pd.read_csv("track_library.csv")

df_tracks = load_data()

# --- 1. GESTIONE STATO E DATI ---
if 'current_track_name' not in st.session_state:
    st.session_state.current_track_name = df_tracks.iloc[0]['Track Name']
if 'current_energy' not in st.session_state:
    st.session_state.current_energy = 50
if 'current_crowd_size' not in st.session_state:
    st.session_state.current_crowd_size = 120 # Partiamo con 120 persone in pista
if 'feedback_log' not in st.session_state:
    st.session_state.feedback_log = []
if 'energy_history' not in st.session_state:
    st.session_state.energy_history = [50]
if 'crowd_history' not in st.session_state:
    st.session_state.crowd_history = [120]

# --- FUNZIONE: ANIMAZIONE FOLLA (CSS/HTML) ---
def render_crowd_simulation(energy):
    """Crea un'animazione quadrata di barre che saltano in base all'energia"""
    if energy < 40:
        speed = "1.2s"        
        color = "#00FFFF"     
        height_min, height_max = "10%", "35%"
    elif energy < 75:
        speed = "0.6s"        
        color = "#00FA9A"     
        height_min, height_max = "30%", "70%"
    else:
        speed = "0.25s"       
        color = "#FF0044"     
        height_min, height_max = "50%", "95%"

    html = f"""
    <style>
    @keyframes jump {{
        0% {{ height: {height_min}; background-color: {color}; opacity: 0.6; }}
        100% {{ height: {height_max}; background-color: {color}; opacity: 1; box-shadow: 0 0 20px {color}; }}
    }}
    .dancefloor {{
        display: flex;
        align-items: flex-end;
        justify-content: space-around;
        height: 320px; 
        background-color: #0A0A0A;
        border: 2px solid #333;
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 20px;
        margin-top: 10px;
    }}
    .dancer {{
        width: 8%;
        border-radius: 6px 6px 0 0;
        animation: jump {speed} infinite alternate ease-in-out;
    }}
    .dancer:nth-child(1) {{ animation-delay: 0.0s; }}
    .dancer:nth-child(2) {{ animation-delay: 0.3s; }}
    .dancer:nth-child(3) {{ animation-delay: 0.1s; }}
    .dancer:nth-child(4) {{ animation-delay: 0.4s; }}
    .dancer:nth-child(5) {{ animation-delay: 0.2s; }}
    .dancer:nth-child(6) {{ animation-delay: 0.5s; }}
    .dancer:nth-child(7) {{ animation-delay: 0.1s; }}
    .dancer:nth-child(8) {{ animation-delay: 0.4s; }}
    </style>
    
    <div class="dancefloor">
        <div class="dancer"></div><div class="dancer"></div><div class="dancer"></div><div class="dancer"></div>
        <div class="dancer"></div><div class="dancer"></div><div class="dancer"></div><div class="dancer"></div>
    </div>
    """
    return html

# --- FUNZIONI LOGICHE (Il "Cervello" del prototipo) ---
def play_track_callback(track_name, is_ai_suggestion=True):
    old_energy = st.session_state.current_energy
    old_crowd = st.session_state.current_crowd_size
    
    track_data = df_tracks[df_tracks['Track Name'] == track_name].iloc[0]
    track_energy_score = int(track_data['Energy'] * 100)
    track_popularity = int(track_data['Popularity'])
    
    # 1. Calcolo nuova energia 
    new_energy = int((old_energy + track_energy_score) / 2) + random.randint(-10, 15)
    new_energy = max(10, min(100, new_energy))
    
    # 2. Calcolo nuove persone
    crowd_shift = int((track_popularity - 50) * 0.3) + random.randint(-2, 5)
    new_crowd = max(10, min(800, old_crowd + crowd_shift))
    
    # Aggiorna stati
    st.session_state.current_energy = new_energy
    st.session_state.current_crowd_size = new_crowd
    st.session_state.energy_history.append(new_energy)
    st.session_state.crowd_history.append(new_crowd)
    st.session_state.current_track_name = track_name
    
    # Log degli eventi arricchito
    if is_ai_suggestion:
        if new_energy >= old_energy and new_crowd >= old_crowd:
            st.session_state.feedback_log.insert(0, f"✅ [+Reinforced] '{track_name}' was a hit! Energy: {new_energy}% | Crowd: +{new_crowd - old_crowd}")
        elif new_energy >= old_energy and new_crowd < old_crowd:
             st.session_state.feedback_log.insert(0, f"⚠️ [Mixed] '{track_name}' boosted energy to {new_energy}%, but lost {old_crowd - new_crowd} people.")
        else:
            st.session_state.feedback_log.insert(0, f"❌ [-Penalized] '{track_name}' flopped. Energy dropped to {new_energy}%.")

def reject_callback(track_name):
    old_energy = st.session_state.current_energy
    old_crowd = st.session_state.current_crowd_size
    
    new_energy = max(10, old_energy - random.randint(2, 6))
    new_crowd = max(10, old_crowd - random.randint(2, 6))
    
    st.session_state.current_energy = new_energy
    st.session_state.current_crowd_size = new_crowd
    st.session_state.energy_history.append(new_energy)
    st.session_state.crowd_history.append(new_crowd)
    st.session_state.feedback_log.insert(0, f"👀 [Log] DJ dismissed '{track_name}'. Crowd waiting... (-{old_crowd - new_crowd} people)")


# --- 2. SIDEBAR ---
with st.sidebar:
    st.title("🎛️ CrowdLoop AI")
    st.write("DJ App Settings")
    st.divider()
    
    st.subheader("Now Playing")
    current_track_data = df_tracks[df_tracks['Track Name'] == st.session_state.current_track_name].iloc[0]
    st.markdown(f"**{st.session_state.current_track_name}**")
    
    st.markdown(f"""
        <div style='background-color: #1A1C23; padding: 10px; border-radius: 8px; text-align: center; border: 1px solid #00FFFF;'>
            <span style='color: #00FFFF; font-weight: bold;'>BPM: {current_track_data['Tempo']}</span> 
            <span style='color: #555;'> | </span> 
            <span style='color: #00FFFF; font-weight: bold;'>Key: {current_track_data['Key']}</span>
        </div>
    """, unsafe_allow_html=True)
    
    st.divider()
    st.subheader("Manual Override")
    st.caption("Ignore AI and pick a track yourself:")
    manual_track = st.selectbox("Select from library:", df_tracks['Track Name'].tolist(), label_visibility="collapsed")
    if st.button("Play Manual Track", use_container_width=True):
        play_track_callback(manual_track, is_ai_suggestion=False)
        st.rerun()


# --- 3. DASHBOARD A 3 COLONNE ---
col1, col2, col3 = st.columns([1, 1.5, 1])

# --- COLONNA 1: Input Visione e Animazione ---
with col1:
    st.header("Dancefloor Camera")
    st.caption("AI scanning the room to read crowd energy & density.")
    
    st.markdown(render_crowd_simulation(st.session_state.current_energy), unsafe_allow_html=True)
    
    met_col1, met_col2 = st.columns(2)
    
    with met_col1:
        if len(st.session_state.energy_history) > 1:
            delta_energy = st.session_state.current_energy - st.session_state.energy_history[-2]
        else:
            delta_energy = 0
        st.metric(label="⚡ ENERGY LEVEL", value=f"{st.session_state.current_energy}%", delta=f"{delta_energy}%")
        
    with met_col2:
        if len(st.session_state.crowd_history) > 1:
            old_crowd = st.session_state.crowd_history[-2]
            delta_crowd = st.session_state.current_crowd_size - old_crowd
            pct_crowd = int((delta_crowd / old_crowd) * 100) if old_crowd > 0 else 0
        else:
            delta_crowd = 0
            pct_crowd = 0
            
        st.metric(label="👥 PEOPLE DETECTED", value=f"{st.session_state.current_crowd_size}", delta=f"{delta_crowd} ({pct_crowd}%)")


# --- COLONNA 2: Motore AI ---
with col2:
    st.header("AI Track Predictor")
    st.caption("Suggesting the next song based on live crowd reactions.")
    st.subheader(f"Suggestions (Target Energy: {st.session_state.current_energy}%)")
    
    suggestions = get_recommendations(df_tracks, current_track_data['Tempo'], st.session_state.current_energy)
    
    for index, row in suggestions.iterrows():
        st.markdown(f"""
        <div style="padding: 15px; background-color: #1A1C23; border-radius: 8px; border-left: 4px solid #00FFFF; margin-bottom: 10px;">
            <h4 style="margin: 0; padding-bottom: 5px;">🎵 {row['Track Name']}</h4>
            <p style="margin: 0; font-size: 14px; color: #A0A0A0;">{row['Artist Name(s)']}</p>
            <div style="margin-top: 10px;">
                <span style="background-color: #2D313A; padding: 3px 8px; border-radius: 4px; font-size: 12px; margin-right: 5px;">⏱️ BPM: <b>{row['Tempo']}</b></span>
                <span style="background-color: #2D313A; padding: 3px 8px; border-radius: 4px; font-size: 12px; margin-right: 5px;">🔑 Key: <b>{row['Key']}</b></span>
                <span style="background-color: #2D313A; padding: 3px 8px; border-radius: 4px; font-size: 12px; margin-right: 5px;">⚡ NRG: <b>{int(row['Energy']*100)}</b></span>
                <span style="background-color: #2D313A; padding: 3px 8px; border-radius: 4px; font-size: 12px; color: #FFA500;">⭐ POP: <b>{int(row['Popularity'])}</b></span>
            </div>
        </div>
        """, unsafe_allow_html=True)
        
        col_btn1, col_btn2 = st.columns(2)
        with col_btn1:
            if st.button("▶ LOAD", key=f"acc_{index}", use_container_width=True):
                play_track_callback(row['Track Name'], is_ai_suggestion=True)
                st.rerun()
        with col_btn2:
            if st.button("✖ DISMISS", key=f"rej_{index}", use_container_width=True):
                reject_callback(row['Track Name'])
                st.rerun()
        st.write("") 


# --- COLONNA 3: Learning Loop ---
with col3:
    st.header("AI Learning Loop")
    st.caption("Tracking what works and adapting in real-time.")
    
    st.line_chart(st.session_state.energy_history, height=200)
    
    st.write("Recent Model Updates")
    log_html = "<div style='background-color: #111; padding: 10px; border-radius: 8px; font-family: monospace; font-size: 13px; height: 350px; overflow-y: auto; border: 1px solid #333;'>"
    if not st.session_state.feedback_log:
        log_html += "<div style='color: #666;'>Awaiting DJ actions...</div>"
    else:
        for log in st.session_state.feedback_log[:15]:
            if "✅" in log:
                log_html += f"<div style='color: #00FFFF; margin-bottom: 8px;'>{log}</div>"
            elif "❌" in log:
                log_html += f"<div style='color: #FF4444; margin-bottom: 8px;'>{log}</div>"
            elif "⚠️" in log:
                log_html += f"<div style='color: #FFA500; margin-bottom: 8px;'>{log}</div>"
            else:
                log_html += f"<div style='color: #AAAAAA; margin-bottom: 8px;'>{log}</div>"
    log_html += "</div>"
    
    st.markdown(log_html, unsafe_allow_html=True)