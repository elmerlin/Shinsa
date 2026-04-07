import React from 'react';
import SpritePet from '../SpritePet';

const FORM_COLORS = {
  beyond: 'border-purple-400/25 text-purple-300',
  ascendant: 'border-amber-400/20 text-amber-300',
  showcase: 'border-cyan-400/15 text-cyan-300',
  trusted: 'border-emerald-400/12 text-emerald-300',
  fresh: 'border-white/[0.08] text-gray-400',
};

export default function PetPresenceChip({ pet, size = 'sm', showTitle = true, showForm = true, onClick }) {
  if (!pet || !pet.character) return null;

  const isCompact = size === 'xs';
  const spriteSize = isCompact ? 20 : size === 'sm' ? 28 : 36;

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] transition-all hover:bg-white/[0.05] hover:border-white/10 max-w-full ${
        isCompact ? 'px-1.5 py-0.5' : 'px-2 py-1'
      } ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
      disabled={!onClick}
    >
      <div className="shrink-0 flex items-center justify-center overflow-hidden rounded-full" style={{ width: spriteSize, height: spriteSize }}>
        <SpritePet
          character={pet.character}
          weightState={pet.weight_state || 'normal'}
          mood={pet.mood || 'happy'}
          equippedHat={pet.equipped_hat || ''}
          equippedTop={pet.equipped_top || ''}
          hatColor={pet.hat_color || ''}
          topColor={pet.top_color || ''}
          size={spriteSize}
        />
      </div>
      {showTitle && (
        <div className={`min-w-0 ${isCompact ? 'max-w-[80px]' : 'max-w-[120px]'}`}>
          <div className={`font-semibold text-white/80 truncate ${isCompact ? 'text-[8px]' : 'text-[10px]'}`}>
            {pet.identity_title || pet.bond_rank?.label || 'Companion'}
          </div>
          {showForm && pet.form?.label && !isCompact && (
            <div className={`text-[8px] truncate ${(FORM_COLORS[pet.form?.id] || '').split(' ')[1] || 'text-gray-500'}`}>
              {pet.form.label}
            </div>
          )}
        </div>
      )}
    </button>
  );
}
