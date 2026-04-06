import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getMyPet, adoptPet, feedPet, getPetCharacters } from '../utils/api';
import PixelPet from '../components/PixelPet';

const MOOD_MESSAGES = {
  desperate: "I'm so hungry... please play some songs!",
  hungry: 'I could really use some food... play a song?',
  happy: "I'm feeling great! Keep playing!",
  content: 'Mmm, that was good. Nice and full!',
  stuffed: "I can't eat another bite! So full!",
};

const MOOD_EMOJIS = {
  desperate: '/emojis/dojocat/7-0.png',
  hungry: '/emojis/dojocat/5-0.png',
  happy: '/emojis/dojocat/1-0.png',
  content: '/emojis/dojocat/3-0.png',
  stuffed: '/emojis/dojocat/4-0.png',
};

const CHARACTER_DESCRIPTIONS = {
  dojocat: 'The legendary Dojo Cat! A martial arts master who loves pad stomping.',
  buu: 'The mighty Buu! Absorbs rhythms and grows stronger with every beat.',
  devit: 'The mischievous Devit! A little devil who dances to the fire of the music.',
  pixiu: 'The mystical Pixiu! A guardian spirit who feasts on musical energy.',
};

const CHARACTER_PREVIEW_COLORS = {
  dojocat: 'from-amber-500/20 to-orange-500/20',
  buu: 'from-purple-500/20 to-pink-500/20',
  devit: 'from-red-500/20 to-yellow-500/20',
  pixiu: 'from-yellow-500/20 to-amber-500/20',
};

function PetPage() {
  const { user } = useAuth();
  const [pet, setPet] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adopting, setAdopting] = useState(false);
  const [feeding, setFeeding] = useState(false);
  const [showSelect, setShowSelect] = useState(false);
  const [feedAnimation, setFeedAnimation] = useState(false);

  const loadPet = useCallback(async () => {
    try {
      const [petRes, charRes] = await Promise.all([getMyPet(), getPetCharacters()]);
      setPet(petRes.pet);
      setCharacters(charRes.characters || []);
      if (!petRes.pet) setShowSelect(true);
    } catch (err) {
      console.error('Failed to load pet:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) loadPet();
    else setLoading(false);
  }, [user, loadPet]);

  const handleAdopt = async (characterId) => {
    setAdopting(true);
    try {
      const res = await adoptPet(characterId);
      setPet(res.pet);
      setShowSelect(false);
    } catch (err) {
      console.error('Failed to adopt pet:', err);
    } finally {
      setAdopting(false);
    }
  };

  const handleFeed = async () => {
    setFeeding(true);
    setFeedAnimation(true);
    try {
      const res = await feedPet(1);
      setPet(res.pet);
    } catch (err) {
      console.error('Failed to feed pet:', err);
    } finally {
      setFeeding(false);
      setTimeout(() => setFeedAnimation(false), 600);
    }
  };

  if (!user) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center">
        <h1 className="text-2xl font-bold mb-4">Emoji Pet</h1>
        <p className="text-gray-400">Log in to adopt your very own emoji pet!</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto p-6 text-center">
        <div className="animate-pulse text-gray-400">Loading your pet...</div>
      </div>
    );
  }

  // Character selection screen
  if (showSelect || !pet) {
    return (
      <div className="max-w-2xl mx-auto p-4 sm:p-6">
        <h1 className="text-2xl font-bold mb-2 text-center">Choose Your Pet</h1>
        <p className="text-gray-400 text-center mb-6 text-sm">
          Pick a companion! Feed them by playing songs to keep them happy and healthy.
        </p>
        <div className="grid grid-cols-2 gap-4">
          {characters.map((char) => (
            <button
              key={char.id}
              onClick={() => handleAdopt(char.id)}
              disabled={adopting}
              className={`
                relative rounded-xl border border-white/10 p-4 text-center
                bg-gradient-to-br ${CHARACTER_PREVIEW_COLORS[char.id] || 'from-gray-500/20 to-gray-600/20'}
                hover:border-white/30 hover:scale-[1.02] active:scale-[0.98]
                transition-all duration-200 disabled:opacity-50
              `}
            >
              <div className="flex justify-center mb-3">
                <PixelPet character={char.id} weightState="normal" size={6} />
              </div>
              <div className="font-bold text-lg">{char.name}</div>
              <p className="text-xs text-gray-400 mt-1">
                {CHARACTER_DESCRIPTIONS[char.id] || ''}
              </p>
            </button>
          ))}
        </div>
        {pet && (
          <button
            onClick={() => setShowSelect(false)}
            className="mt-4 w-full text-center text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    );
  }

  // Main pet view
  const fullnessPercent = pet.fullness;
  const fullnessColor =
    fullnessPercent <= 15 ? 'bg-red-500' :
    fullnessPercent <= 35 ? 'bg-orange-500' :
    fullnessPercent <= 65 ? 'bg-yellow-500' :
    fullnessPercent <= 85 ? 'bg-green-500' :
    'bg-emerald-400';

  return (
    <div className="max-w-lg mx-auto p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold">
          My {characters.find((c) => c.id === pet.character)?.name || pet.character}
        </h1>
        <button
          onClick={() => setShowSelect(true)}
          className="text-xs text-gray-400 hover:text-white border border-white/10 rounded-lg px-3 py-1.5 transition-colors"
        >
          Change Pet
        </button>
      </div>

      {/* Pet display area */}
      <div
        className={`
          relative rounded-2xl border border-white/10 p-8
          bg-gradient-to-b from-gray-900 to-gray-950
          flex flex-col items-center
          ${feedAnimation ? 'animate-bounce-once' : ''}
        `}
      >
        {/* Weight state badge */}
        <div className="absolute top-3 right-3">
          <span className={`
            text-xs px-2 py-1 rounded-full font-medium
            ${pet.weight_state === 'starving' ? 'bg-red-500/20 text-red-400' : ''}
            ${pet.weight_state === 'thin' ? 'bg-orange-500/20 text-orange-400' : ''}
            ${pet.weight_state === 'normal' ? 'bg-green-500/20 text-green-400' : ''}
            ${pet.weight_state === 'chubby' ? 'bg-blue-500/20 text-blue-400' : ''}
            ${pet.weight_state === 'fat' ? 'bg-purple-500/20 text-purple-400' : ''}
          `}>
            {pet.weight_state}
          </span>
        </div>

        {/* The pet */}
        <div className="my-4">
          <PixelPet
            character={pet.character}
            weightState={pet.weight_state}
            size={8}
          />
        </div>

        {/* Speech bubble */}
        <div className="bg-white/5 rounded-xl px-4 py-2 text-sm text-gray-300 text-center max-w-xs mt-2">
          <span className="italic">&ldquo;{MOOD_MESSAGES[pet.mood] || 'Hello!'}&rdquo;</span>
        </div>
      </div>

      {/* Fullness bar */}
      <div className="mt-6">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-400">Fullness</span>
          <span className="font-mono text-white">{fullnessPercent}%</span>
        </div>
        <div className="w-full h-4 bg-gray-800 rounded-full overflow-hidden border border-white/5">
          <div
            className={`h-full ${fullnessColor} transition-all duration-500 rounded-full`}
            style={{ width: `${fullnessPercent}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="bg-white/5 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold">{pet.total_songs_fed}</div>
          <div className="text-xs text-gray-400 mt-1">Songs Fed</div>
        </div>
        <div className="bg-white/5 rounded-xl p-3 text-center">
          <div className="text-2xl font-bold capitalize">{pet.mood}</div>
          <div className="text-xs text-gray-400 mt-1">Mood</div>
        </div>
      </div>

      {/* Feed button */}
      <button
        onClick={handleFeed}
        disabled={feeding || fullnessPercent >= 100}
        className={`
          mt-6 w-full py-3 rounded-xl font-bold text-lg
          transition-all duration-200
          ${fullnessPercent >= 100
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
            : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 active:scale-[0.98] text-white shadow-lg shadow-green-900/30'
          }
          disabled:opacity-60
        `}
      >
        {feeding ? 'Feeding...' : fullnessPercent >= 100 ? 'Pet is Full!' : 'Feed Pet'}
      </button>

      <p className="text-xs text-gray-500 text-center mt-3">
        Your pet gets hungry over time. Play songs in duels, matches, or sync your scores to keep them fed!
      </p>

      <style>{`
        @keyframes bounce-once {
          0%, 100% { transform: translateY(0); }
          30% { transform: translateY(-8px); }
          60% { transform: translateY(-3px); }
        }
        .animate-bounce-once {
          animation: bounce-once 0.5s ease-out;
        }
      `}</style>
    </div>
  );
}

export default PetPage;
