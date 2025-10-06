#!/bin/bash

# --- Impostazioni ---
C_FILE="mpimm.c"
EXECUTABLE="mpimm_exec"
FILE_A="text_A.txt"
FILE_B="text_B.txt"
FILE_C="output_C.txt" # NUOVO: Nome del file per il risultato
NUM_PROCESSES=4      # Aumentato per un test più realistico

# Dimensioni delle matrici (devono corrispondere ai #define nel file C)
NRA=62
NCA=15
NCB=7

echo "--- Script di test per la moltiplicazione di matrici MPI (Strategia A) ---"

# --- 1. Creazione dei file di input di esempio ---
echo "⚙️  Creazione dei file di input..."

# Crea text_A.txt (62x15)
> "$FILE_A"
for ((i=0; i<NRA; i++)); do
    for ((j=0; j<NCA; j++)); do
        echo -n "$i.$j " >> "$FILE_A"
    done
    echo "" >> "$FILE_A"
done

# Crea text_B.txt (15x7)
> "$FILE_B"
for ((i=0; i<NCA; i++)); do
    for ((j=0; j<NCB; j++)); do
        echo -n "$i.$j " >> "$FILE_B"
    done
    echo "" >> "$FILE_B"
done

echo "✅ File di input '$FILE_A' e '$FILE_B' creati."

# --- 2. Compilazione del programma C ---
echo "⚙️  Compilazione di '$C_FILE'..."
mpicc -o "$EXECUTABLE" "$C_FILE"

if [ $? -ne 0 ]; then
    echo "🔥 Errore di compilazione. Script terminato."
    exit 1
fi

echo "✅ Compilazione completata. Eseguibile creato: '$EXECUTABLE'"

# --- 3. Esecuzione del programma MPI ---
echo "🚀 Esecuzione del programma con $NUM_PROCESSES processi..."
# MODIFICATO: Aggiunto FILE_C come terzo argomento
mpirun -n "$NUM_PROCESSES" --oversubscribe ./"$EXECUTABLE" "$FILE_A" "$FILE_B" "$FILE_C"

# --- 4. NUOVO: Visualizzazione del risultato ---
echo "📄  Contenuto del file di output '$FILE_C':"
cat "$FILE_C"
echo "----------------------------------------"


echo "--- Script terminato ---"

# --- Pulizia dei file generati ---
echo "🧹 Pulizia dei file generati..."
# MODIFICATO: Aggiunto FILE_C alla lista dei file da cancellare
rm "$EXECUTABLE" "$FILE_A" "$FILE_B" "$FILE_C"
echo "✅ Pulizia completata."