import pandas as pd

def get_recommendations(df, current_bpm, crowd_energy_level, user_weights=None):
    """
    Simula il modello di raccomandazione.
    Filtra per BPM compatibili e ordina in base all'energia della folla.
    """
    # 1. Filtra per BPM compatibili (Beatmatching: +/- 5 BPM)
    df_filtered = df[(df['Tempo'] >= current_bpm - 5) & (df['Tempo'] <= current_bpm + 5)].copy()
    
    # Se non ci sono canzoni compatibili, restituisci tutto
    if df_filtered.empty:
        df_filtered = df.copy()

    # 2. Logica AI basata sull'energia
    # Se l'energia della folla è bassa (< 50), l'AI cerca di "salvare la pista" 
    # suggerendo canzoni con altissima Energy e Popularity.
    if crowd_energy_level < 50:
        df_filtered = df_filtered.sort_values(by=['Energy', 'Popularity'], ascending=[False, False])
    
    # Se l'energia è già alta, l'AI cerca di "mantenere il flow" 
    # suggerendo canzoni con un'energia simile a quella attuale.
    else:
        # Moltiplichiamo Energy per 100 per allinearla al livello folla (0-100)
        df_filtered['Energy_Diff'] = abs((df_filtered['Energy'] * 100) - crowd_energy_level)
        df_filtered = df_filtered.sort_values(by=['Energy_Diff', 'Popularity'], ascending=[True, False])
        
    # Ritorna le prime 3 opzioni
    return df_filtered.head(3)