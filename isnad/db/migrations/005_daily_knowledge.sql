CREATE TABLE IF NOT EXISTS daily_quran_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  surah_number INTEGER NOT NULL CHECK (surah_number BETWEEN 1 AND 114),
  verse_number INTEGER NOT NULL CHECK (verse_number > 0),
  surah_name TEXT NOT NULL,
  arabic_text TEXT NOT NULL,
  translation TEXT NOT NULL,
  reflection TEXT NOT NULL,
  source_label TEXT NOT NULL DEFAULT 'Qur’an',
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_hadith_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  lesson TEXT NOT NULL,
  narrator TEXT,
  collection TEXT NOT NULL,
  authenticity TEXT NOT NULL,
  source_label TEXT NOT NULL,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_vocabulary_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  arabic TEXT NOT NULL,
  transliteration TEXT NOT NULL,
  meaning TEXT NOT NULL,
  root_letters TEXT NOT NULL,
  explanation TEXT NOT NULL,
  quran_reference TEXT,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_checkins (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_date DATE NOT NULL,
  quran_read BOOLEAN NOT NULL DEFAULT false,
  hadith_read BOOLEAN NOT NULL DEFAULT false,
  vocabulary_reviewed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, content_date)
);

CREATE INDEX IF NOT EXISTS daily_checkins_user_completed_idx
  ON daily_checkins(user_id, content_date DESC)
  WHERE completed_at IS NOT NULL;

INSERT INTO daily_quran_items (
  slug, surah_number, verse_number, surah_name, arabic_text, translation, reflection
) VALUES
  ('al-ikhlas-1', 112, 1, 'Al-Ikhlāṣ', 'قُلْ هُوَ ٱللَّهُ أَحَدٌ', 'Say: He is Allah, One.', 'Renew sincerity by directing worship, hope, fear, and reliance to Allah alone.'),
  ('al-ikhlas-2', 112, 2, 'Al-Ikhlāṣ', 'ٱللَّهُ ٱلصَّمَدُ', 'Allah is the One upon whom all depend.', 'Remember that every need ultimately returns to Allah, while He needs nothing from creation.'),
  ('al-ikhlas-3', 112, 3, 'Al-Ikhlāṣ', 'لَمْ يَلِدْ وَلَمْ يُولَدْ', 'He neither begets nor was born.', 'Allah is unlike creation and is free of lineage, dependence, and limitation.'),
  ('al-ikhlas-4', 112, 4, 'Al-Ikhlāṣ', 'وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌۢ', 'And there is none comparable to Him.', 'Avoid imagining Allah through created comparisons; affirm His perfection without likeness.'),
  ('ash-sharh-5', 94, 5, 'Ash-Sharḥ', 'فَإِنَّ مَعَ ٱلْعُسْرِ يُسْرًا', 'With hardship comes ease.', 'Hardship and relief can exist together. Continue lawful effort while trusting Allah’s promise.'),
  ('ash-sharh-6', 94, 6, 'Ash-Sharḥ', 'إِنَّ مَعَ ٱلْعُسْرِ يُسْرًا', 'Indeed, with hardship comes ease.', 'The repeated promise teaches patience, hope, and persistence rather than despair.'),
  ('al-kawthar-1', 108, 1, 'Al-Kawthar', 'إِنَّآ أَعْطَيْنَـٰكَ ٱلْكَوْثَرَ', 'Indeed, We have granted you abundant good.', 'Recognize Allah’s favors and respond with gratitude, worship, and generosity.'),
  ('al-kawthar-2', 108, 2, 'Al-Kawthar', 'فَصَلِّ لِرَبِّكَ وَٱنْحَرْ', 'So pray to your Lord and sacrifice for Him.', 'Gratitude is shown through sincere worship and directing acts of devotion to Allah alone.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO daily_hadith_items (
  slug, summary, lesson, narrator, collection, authenticity, source_label
) VALUES
  ('intentions', 'Actions are judged by intentions, and each person receives according to what was intended.', 'Before acting, correct the purpose. A lawful deed becomes worship when it is done sincerely and correctly.', 'ʿUmar ibn al-Khaṭṭāb', 'Ṣaḥīḥ al-Bukhārī and Ṣaḥīḥ Muslim', 'Ṣaḥīḥ', 'Hadith of intentions'),
  ('safe-tongue-hand', 'A Muslim is one from whose tongue and hand other Muslims are safe.', 'Faith should produce restraint. Avoid verbal abuse, threats, humiliation, and physical harm.', 'ʿAbdullāh ibn ʿAmr', 'Ṣaḥīḥ al-Bukhārī and Ṣaḥīḥ Muslim', 'Ṣaḥīḥ', 'Safety from harm'),
  ('hearts-deeds', 'Allah does not judge people by appearance or wealth, but by their hearts and deeds.', 'Give priority to sincerity, character, and obedience rather than status or outward display.', 'Abū Hurayrah', 'Ṣaḥīḥ Muslim', 'Ṣaḥīḥ', 'Hearts and deeds'),
  ('strong-believer', 'The strong believer is better and more beloved to Allah than the weak believer, while there is good in both.', 'Build useful strength in faith, character, knowledge, health, and responsibility while seeking Allah’s help.', 'Abū Hurayrah', 'Ṣaḥīḥ Muslim', 'Ṣaḥīḥ', 'Beneficial strength'),
  ('speak-good', 'Whoever believes in Allah and the Last Day should speak good or remain silent.', 'Pause before speaking or posting. Silence is better than speech that harms, misleads, or creates conflict.', 'Abū Hurayrah', 'Ṣaḥīḥ al-Bukhārī and Ṣaḥīḥ Muslim', 'Ṣaḥīḥ', 'Guarding speech'),
  ('love-for-brother', 'Faith is incomplete until a person loves for his brother what he loves for himself.', 'Practice sincere goodwill by wanting guidance, safety, lawful provision, and success for others.', 'Anas ibn Mālik', 'Ṣaḥīḥ al-Bukhārī and Ṣaḥīḥ Muslim', 'Ṣaḥīḥ', 'Brotherhood'),
  ('consistent-deeds', 'The deeds most beloved to Allah are those maintained consistently, even when small.', 'Choose a sustainable act of worship and protect it from neglect caused by unrealistic intensity.', 'ʿĀʾishah', 'Ṣaḥīḥ al-Bukhārī and Ṣaḥīḥ Muslim', 'Ṣaḥīḥ', 'Consistency')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO daily_vocabulary_items (
  slug, arabic, transliteration, meaning, root_letters, explanation, quran_reference
) VALUES
  ('ilm', 'عِلْم', 'ʿilm', 'knowledge', 'ع ل م', 'Knowledge that is sound should lead to recognition, clarity, and responsible action.', '20:114'),
  ('rahmah', 'رَحْمَة', 'raḥmah', 'mercy', 'ر ح م', 'Mercy includes compassion, care, forgiveness, and beneficial treatment.', '21:107'),
  ('taqwa', 'تَقْوَى', 'taqwā', 'God-consciousness', 'و ق ي', 'Taqwā is protective awareness of Allah that moves a person toward obedience and away from sin.', '2:197'),
  ('sabr', 'صَبْر', 'ṣabr', 'patience and steadfastness', 'ص ب ر', 'Ṣabr includes remaining obedient, resisting sin, and responding steadily to hardship.', '2:153'),
  ('shukr', 'شُكْر', 'shukr', 'gratitude', 'ش ك ر', 'Gratitude combines recognition of a blessing, praise of Allah, and using the blessing lawfully.', '14:7'),
  ('huda', 'هُدًى', 'hudā', 'guidance', 'ه د ي', 'Guidance includes being shown the truth and being enabled to follow it.', '2:2'),
  ('dhikr', 'ذِكْر', 'dhikr', 'remembrance', 'ذ ك ر', 'Dhikr includes remembering Allah with the heart and tongue and responding through obedience.', '13:28'),
  ('ikhlas', 'إِخْلَاص', 'ikhlāṣ', 'sincerity', 'خ ل ص', 'Sincerity means purifying worship and intention from seeking the praise or approval of people.', '39:2')
ON CONFLICT (slug) DO NOTHING;
