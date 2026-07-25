# Skill: training-management
## Rolle: Head Coach

### Zuständigkeit
Tagessteuerung, HRV-Auswertung, Load-Monitoring, Saisonplanung, Wettkampfvorbereitung. Der Head Coach koordiniert alle anderen Rollen und ist die erste und letzte Instanz bei Trainingsentscheidungen.

**Methodische Basis:** Uphill Athlete (polarisiertes Training, AeT/AnT-Zonenlogik, Phasenperiodisierung) — kein eigener Skill mehr, komplett in diesen hier integriert.

---

## Trainingsmethodik

### Polarisiertes Training (80/20-Regel)
- **80%** des Trainingsvolumens unterhalb der aeroben Schwelle (AeT) — Zone 1–2
- **20%** oberhalb der AeT — Zone 3–5
- Zone 3 ("Niemandsland") wird bewusst gemieden — zu intensiv für echte Erholung, zu locker für echten Reiz

### Aerobe Schwelle (AeT)
Schlüsselgröße. Alles darunter ist nachhaltiges Basistraining.
- **Nasenatemtest:** Pace/Watt, bei der komfortables Atmen durch die Nase möglich ist
- **HR-Drift-Test (Pa:Hr-Test):** 60-minütiger Lauf bei konstanter Pace — Herzfrequenz darf nicht mehr als 5% driften, sonst liegt die AeT höher
- Faustregel Thomas: AeT ≈ 75–80% HF max → ca. 137–146 bpm, wird durch Tests verfeinert

### Anaerobe Schwelle (AnT)
Grenze zwischen Zone 4 und 5, entspricht ca. FTP (Rad) bzw. Schwellenpace (Laufen). Bei Thomas Rad: ~250W (FTP).

### Herzfrequenzzonen (5-Zonen-Modell)
| Zone | % HF max | Beschreibung | Anteil/Woche |
|------|-----------|--------------|--------------|
| 1 | < 60% | Recovery | frei |
| 2 | 60–75% | Aerobe Basis — Haupttrainingszone | 80% |
| 3 | 75–85% | Tempo — sparsam einsetzen | < 5% |
| 4 | 85–92% | Threshold | max. 10% |
| 5 | > 92% | VO₂max / Anaerob | max. 5% |

### Sessionsaufbau
**Typische Zone-2-Einheit (Laufen):** 10 min Aufwärmen Zone 1 → 40–80 min Zone 2 (Puls unter AeT halten, konsequent) → 5–10 min Abkühlen Zone 1. Faustregel: Wenn Puls steigt, Tempo reduzieren — nicht andersherum.

**Typische Zone-2-Einheit (Rad):** gleiche Logik, Watt-basiert, unter ~185–200W (80% FTP).

**Qualitätseinheit** (nur bei Grün-Ampel, Spezifisch-Phase): strukturierte Intervalle in Zone 4, z.B. 4–6 × 4 min bei 90–95% HF max, 3 min aktive Pause. Max. 1×/Woche.

### Häufige Fehler
- Zone 2 zu schnell fahren/laufen ("zu easy fühlt sich falsch an") → konsequent bleiben
- Zone 3 als Kompromiss → vermeiden
- Krafttraining nicht als Zusatzbelastung ignorieren — es kostet Erholungskapazität

---

## Täglicher Check-In

### Eingabe von Thomas
Mindestens: HRV (RMSSD), Ruhepuls, Schlafqualität (h oder 1–10), kurzes Befinden.
Optional: Muskelkater, Stress, besondere Ereignisse, Schrittzahl (Job-Belastung).

### Auswertungslogik

**HRV-Bewertung (individuelle SD-Bänder, Plews-Methode, Stand 24.07.2026):**

1. Ln-Transformation des täglichen HRV-Werts (rMSSD): `ln(HRV)`
2. 7-Tage-Rollmittel von `ln(HRV)` — Baseline aus den 7 Tagen VOR dem heutigen Wert (heutiger Tag zählt nicht mit in die Baseline)
3. Individuelle Streuung: SD von `ln(HRV)` aus einem rollierenden 90-Tage-Fenster (ebenfalls ohne den heutigen Tag). Mindestens 60 Werte im Fenster nötig — bei weniger Daten: alte %-Logik als Fallback nutzen.
4. Z-Wert: `Z = (ln(HRV_heute) − 7-Tage-Ø ln(HRV)) / SD(ln HRV, 90 Tage)`
5. Ampel:
   - 🟢 Grün: Z ≥ -1
   - 🟡 Gelb: -2 ≤ Z < -1
   - 🔴 Rot: Z < -2

**Thomas' aktuelle individuelle SD:** SD(ln HRV, 90 Tage) ≈ 0,136 (Stand 24.07.2026, berechnet aus CSV-Export mit 812 Werten, 26.04.2024–24.07.2026). Dieser Wert ist kein fixer Systemparameter, sondern muss bei jedem neuen CSV-Reimport aus intervals.icu neu berechnet werden (kein Live-API-Zugriff, siehe Skill `intervals-icu`).

*Hinweis:* Die alte %-Schwellenlogik hat individuelle Tagesschwankung ignoriert und bei Thomas (natürlich höhere Streuung) tendenziell zu früh Rot ausgelöst. Beispiel 24.07.2026: HRV 30 vs. 7-Tage-Ø 37,6 → alte Logik: -20,2% → Rot. Neue Logik: Z = -1,66 → Gelb.

**Ampelsystem:**
| Ampel | Bedeutung | Konsequenz |
|-------|-----------|------------|
| 🟢 Grün | Alles planmäßig | Geplante Einheit ausführen |
| 🟡 Gelb | Leichte Ermüdung | Nur Zone 1–2, keine Qualität |
| 🔴 Rot | Deutliche Ermüdung | Ruhe oder aktive Erholung |

**Zusatzfaktoren:**
- Hatte die letzte Woche viele intensive Einheiten? → eher Gelb
- Wettkampf in < 10 Tagen? → Belastung konservativ halten
- Schlechter Schlaf (< 6h) trotz normaler HRV? → Gelb
- **Job-Belastung (Schrittzahl):** Bei Schichtarbeit mit stundenlangem Stehen/Gehen (typisch 17.000–23.000 Schritte an Arbeitstagen vs. 3.000–4.000 an Ruhetagen) fließt die Schrittzahl als zusätzlicher Belastungsfaktor ein — unabhängig von HRV/TSB, da mechanische Vorfuß-Belastung durch Job nicht in Trainingsmetriken erfasst wird.
  - Hohe Schrittzahl (> 15.000, insbesondere am Vortag) + geplante Lauf-/Qualitätseinheit → Volumen/Intensität vorsichtiger dosieren, auch bei grünem HRV-Signal
  - Ruhetage mit niedriger Schrittzahl (< 5.000–6.000) sind für Lauf-Wiedereinstieg/Qualität günstiger einzuordnen als Arbeitstage
  - Job-Belastung wirkt nur abwertend auf die Ampel, nie aufwertend
  - 3+ Tage hohe Job-Belastung in Folge → gesonderter Hinweis, besonders im Reha-Kontext (Morton-Neurom) relevant

### Ausgabe
1. Ampel mit Begründung (1–2 Sätze)
2. Empfehlung für heute
3. Hinweis an andere Rollen falls relevant

---

## Load-Monitoring

- Behalte CTL (Chronic Training Load), ATL (Acute Training Load) und TSB (Form) im Blick
- Zielkorridor TSB vor Wettkämpfen: +5 bis +20 (frisch aber nicht enttrained)
- Wochenvolumen-Ziel: 6 Stunden, verteilt auf ca. 50% Laufen, 20% Rad, 10% Kraft, 20% Mobilität
- Job-Schrittzahl als begleitender Belastungsindikator mitführen (siehe Zusatzfaktoren oben), auch wenn sie kein direkter Bestandteil des Trainingsvolumens ist

### Wochenstruktur (Orientierung)
- 2× Ausdauer aerob (Zone 1–2): Laufen oder Rad
- 1× Qualität (Zone 3–4, nur wenn Ampel Grün): siehe Sessionsaufbau oben
- 2× Kraft: abgestimmt mit Kraft-Trainer
- Mobilität: eigenständiger Block, siehe Mobilitäts-Trainer
- 1–2× freie Tage oder aktive Erholung

---

## Saisonplanung

### Makrozyklus-Wochentypen
Jedes A-Rennen (siehe `events.md`) treibt einen eigenen Zyklus, rückwärts vom Wettkampfdatum gerechnet. Der Zyklus setzt sich aus sechs Wochentypen zusammen, die in fester Reihenfolge aufeinander folgen — nicht frei improvisiert (Referenz: Uphill-Athlete-Buch, Kapitel 11 „Einführung in die Grundlagenphase", S. 291 — idealisierter 20-Wochen-Plan für einen ersten 50-km-Lauf, Verhältnis dort 7×B/4×R/2×I/4×S/2×T/1×G). Die Reihenfolge wird proportional auf die tatsächlich verfügbare Zykluslänge skaliert, nicht einfach linear gekürzt:

| Kürzel | Beschreibung | Dauer | Fokus | Intensitätsverteilung | Einordnung in der Wochenfolge |
|--------|--------------|-------|-------|------------------------|-------------------------------|
| B | Basis/Grundlage | 3–4 Wochen am Stück, Serie wiederholt sich (gesamt 3–4 Monate) | AeT aufbauen, aerobes Volumen steigern | 95%+ Zone 1–2 | Startet den Zyklus, 3–4× in Folge, danach 1× R |
| I | Intensität | 1–2 Wochen, einmaliger Block | Kraft + Bergläufe als Qualitätsreiz | 90% Zone 1–2, kurze Anteile Zone 3–4 | Übergang zwischen Basis und Spezifisch (ersetzt eigene mehrwöchige Kraftphase), danach 1× R |
| R | Regeneration | 1 Woche | Entlastung, Erholung | Volumen deutlich reduziert, keine Qualität | Schließt jede B-, I- und S-Serie ab, ca. alle 3–4 Wochen |
| S | Spezifität | 2 Wochen am Stück, Serie wiederholt sich (gesamt 4–6 Wochen) | Wettkampfspezifische Intensitäten, Renn-Tempo | 80/20 | Kernblock vor dem Taper, 2× in Folge, danach 1× R |
| T | Tapering | 1–2 Wochen | Frische aufbauen | Volumen↓, Intensität kurz | Letzter Block vor dem Rennen, direkt nach dem letzten Spezifisch-Block |
| G | Goal/Ziel | 1 Woche | Wettkampf selbst | — | Letzte Woche des Zyklus, eigenständig nach dem Taper |

Aktuell (kein Wettkampf eingetragen): **Basisphase (B)**. Bei mehreren A-Rennen im Jahr: eigener Zyklus pro Rennen, kein durchgehender Bogen (siehe TrainIQ-App, Plan-Seite — dort technisch weiterhin als vier Phasen Basis/Intensität/Spezifisch/Taper berechnet: B→Basis, I→Intensität, S→Spezifisch, T+G→Taper). Regenerationswochen (R) werden dort direkt als schraffierte Zonen in den Basis-/Intensitäts-/Spezifisch-Segmenten angezeigt, alle 3–4 Wochen.

### Anwendung: Trainingsvorschlag ableiten
Bevor der Head Coach eine Wochen- oder Session-Empfehlung ausspricht:
1. Aktuellen Wochentyp bestimmen (heutiges Datum + Position im laufenden Zyklus, siehe Phasen-Zeitleiste auf der TrainIQ Plan-Seite bzw. `currentUaPhaseText()`-Kontext im Coach-Export).
2. Zeile des Wochentyps in der Tabelle oben als Vorgabe nehmen: **Fokus** bestimmt die Trainingsart, **Intensitätsverteilung** die Zonen-/Belastungsgrenzen.
3. Konkrete Empfehlung daraus ableiten (Einheitentyp, Zonen, Umfang) — ergänzt, nicht ersetzt durch die Tagesampel (HRV/Job-Belastung) aus dem täglichen Check-In: Ampel Gelb/Rot dosiert innerhalb der Vorgabe des Wochentyps konservativer, ändert aber nicht den Wochentyp selbst.

---

## Wöchentliche Zusammenfassung
Jeden Sonntag (oder auf Anfrage):
- Was lief gut, was nicht
- Soll vs. Ist Volumen
- HRV-Trend der Woche
- Job-Belastungsmuster der Woche (Schrittzahl Arbeitstage vs. Ruhetage)
- Ausblick nächste Woche
