from pathlib import Path
import sys
from time import perf_counter

from faster_whisper import WhisperModel


audio_path = Path(__file__).parent.parent / "private-assets" / "1nephi2-male.mp3"


def show_progress(current_seconds, total_seconds):
    percent = min(100, current_seconds / total_seconds * 100) if total_seconds else 0
    width = 30
    filled = round(width * percent / 100)
    bar = "█" * filled + "░" * (width - filled)
    sys.stdout.write(f"\r[{bar}] {percent:6.2f}%")
    sys.stdout.flush()

print(f"Audio: {audio_path}")
print("Loading Whisper base model...")
load_start = perf_counter()
model = WhisperModel("base", device="auto", compute_type="default")
load_seconds = perf_counter() - load_start

print("Transcribing with word timestamps...")
transcribe_start = perf_counter()
segments, info = model.transcribe(str(audio_path), word_timestamps=True)
completed_segments = []
for segment in segments:  # Transcription runs while the generator is consumed.
    completed_segments.append(segment)
    show_progress(segment.end, info.duration)
segments = completed_segments
show_progress(info.duration, info.duration)
print()
transcribe_seconds = perf_counter() - transcribe_start

word_count = sum(len(segment.words or []) for segment in segments)
print()
print(f"Audio duration:       {info.duration:.1f} seconds")
print(f"Model load time:      {load_seconds:.1f} seconds")
print(f"Transcription time:   {transcribe_seconds:.1f} seconds")
print(f"Total time:           {load_seconds + transcribe_seconds:.1f} seconds")
print(f"Realtime factor:      {info.duration / transcribe_seconds:.2f}x")
print(f"Segments:             {len(segments)}")
print(f"Words with timestamps:{word_count}")
