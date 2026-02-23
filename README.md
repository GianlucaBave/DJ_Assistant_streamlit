# CrowdLoop AI: Live DJ Assistant & Track Predictor

## 📌 Project Overview
**CrowdLoop AI** is a Streamlit-based prototype designed to assist DJs during live performances. The core idea is an AI assistant that dynamically recommends the next track to play by simulating the "reading of the room"—analyzing real-time crowd energy and dancefloor density to suggest the perfect song to keep the party alive or rescue a dying dancefloor.

This project was developed for the **Prototyping with Streamlit** assignment, focusing on placing data and AI at the center of the value proposition.

## 🎯 Value Proposition
In a typical live set, DJs rely primarily on their intuition to match tracks and gauge the crowd. CrowdLoop AI brings an analytical, feedback-loop approach:
- **For Low Energy (Bailing out the Dancefloor):** If the crowd energy drops below 50%, the AI aggressively recommends high-energy, high-popularity tracks to save the vibe.
- **For High Energy (Maintaining the Flow):** If the energy is already high, the AI suggests tracks that closely match the current energy level to sustain momentum.
- **Beatmatching:** All recommendations are filtered to be within a +/- 5 BPM range of the currently playing track to ensure seamless transitions.
- **Reinforcement Learning Foundation:** While this prototype uses heuristic logic to simulate the logic, the real application is designed to be powered by a **Reinforcement Machine Learning** model. The RL agent would continuously learn an optimal policy for track sequencing by treating the DJ's track selections and the crowd's subsequent reactions (energy increases/decreases) as continuous rewards or penalties.
## 🛠️ Architecture & Features

This prototype implements the three main aspects discussed in class: **Appearance/UX**, **Data/Model Pipeline**, and **Accuracy/Logic Separation**.

### 1. Data & Model Pipeline
The data processing and prediction logic are explicitly separated from the Streamlit UI to follow best practices (separating offline parts/prediction logic from the runtime).
* **Data Preparation (`data_cleaning.ipynb`):** An offline Jupyter Notebook used to load the original `.csv` file, filter relevant columns, clean the BPM (Tempo) rounding it to integers, and map the musical `Key` into professional DJ notation (Camelot Wheel system, e.g., '1A', '8B'). The output is exported as `track_library.csv`.
* **Prediction Logic (`recommender.py`):** The core AI logic is decoupled from the UI. It receives the current BPM and Crowd Energy, filters the pandas dataframe accordingly, applies the behavioral logic (save the floor vs. keep the flow), and returns the top 3 recommendations.

### 2. User Experience & Streamlit Layout
The app features a sophisticated, dark-themed **3-column dashboard** layout, designed to look like a modern piece of DJ software:
* **Dancefloor Camera (Vision):** Uses custom HTML/CSS animations (`st.markdown(..., unsafe_allow_html=True)`) to simulate a live view of the crowd's energy (represented by jumping bars that change color and speed dynamically based on the current state). It utilizes `st.metric` with `delta` values to track Energy Level and People Detected.
* **AI Track Predictor (Engine):** Displays the 3 contextual track suggestions fetched from `recommender.py`. DJs can choose to either **[▶ LOAD]** a track (incorporating it into the set) or **[✖ DISMISS]** it.
* **AI Learning Loop (Analytics):** Visualizes the historical performance of the set. It uses `st.line_chart` for energy trends and a custom-styled scrolling log for the DJ's actions and the crowd's resulting reinforcement (Positive, Mixed, or Penalized).

### 3. State Management
The prototype heavily relies on `st.session_state` to maintain persistence across reruns (which happen on every button click). It tracks the current track, current energy, number of people, and historical logs, creating a continuous "loop" of actions and reactions.

## 🚀 How to Run Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/GianlucaBave/DJ_Assistant_streamlit.git
   cd DJ_Assistant_streamlit
   ```

2. **Install dependencies:**
   Make sure you have Pandas and Streamlit installed.
   ```bash
   pip install streamlit pandas
   ```

3. **Run the Streamlit app:**
   ```bash
   streamlit run app.py
   ```

## 🌐 How to Deploy (Streamlit Community Cloud)

The easiest way to share this application is through **Streamlit Community Cloud**.

1. Go to [share.streamlit.io](https://share.streamlit.io/)
2. Log in with your GitHub account.
3. Click on **"New app"**.
4. Configure the deployment:
   - **Repository:** `GianlucaBave/DJ_Assistant_streamlit`
   - **Branch:** `main`
   - **Main file path:** `app.py`
5. Click **"Deploy!"**
The app will automatically install dependencies from `requirements.txt` and be live in a few minutes.

## 📝 Process Documentation (Deliverable 3 Summary)
* **Ideation:** Started with the common issue DJs face: losing the crowd. The idea evolved into a "feedback loop" where the AI suggests tracks and the simulated crowd reacts, altering the state for the next suggestion.
* **Data Gathering:** Sourced a dataset of tracks including audio features provided by Spotify (Danceability, Energy, Tempo, Key, etc.).
* **Prototyping:**
    * **Step 1:** Used a Jupyter Notebook offline to clean the dataset, converting musical keys to DJ-friendly formats (Camelot System).
    * **Step 2:** Created `recommender.py` to isolate the "AI Model" business logic.
    * **Step 3:** Built `app.py`, focusing on Streamlit's layout tools (`st.sidebar`, `st.columns`) and session state. Integrated custom CSS animations to provide visual feedback for the simulation without needing external graphic assets.
* **AI Assistance:** Generative AI was used to draft the initial boilerplate for Streamlit, generate the custom CSS keyframes for the "jumping crowd" animation, and refine the logic within the `get_recommendations` function.
