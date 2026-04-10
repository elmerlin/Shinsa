import React, { useMemo } from 'react';
import SpritePet from '../SpritePet';

const MOOD_MESSAGES = {
  desperate: "I'm so hungry...",
  hungry: 'I could use a snack...',
  happy: "I'm feeling great!",
  content: 'Life is good!',
  stuffed: 'So full!',
};

const ACCENT_STYLES = {
  cyan: 'border-cyan-400/20 bg-cyan-500/[0.08] text-cyan-100',
  violet: 'border-violet-400/20 bg-violet-500/[0.08] text-violet-100',
  amber: 'border-amber-400/20 bg-amber-500/[0.08] text-amber-100',
  rose: 'border-rose-400/20 bg-rose-500/[0.08] text-rose-100',
  emerald: 'border-emerald-400/20 bg-emerald-500/[0.08] text-emerald-100',
};

function buildAccessoryList(pet) {
  const fashion = pet?.fashion || {};
  return [fashion.hat, fashion.top, fashion.belt, fashion.shoes].filter(Boolean);
}

function formatPlayCount(entry) {
  const count = Number(entry?.total_plays) || 0;
  const cadence = String(entry?.cadence || '').trim() || 'runs';
  return `${count} ${count === 1 ? cadence.replace(/s$/, '') : cadence}`;
}

function MiniMeter({ label, value = 0, tone = 'orange' }) {
  const fillClass = tone === 'pink' ? 'bg-pink-500' : 'bg-orange-500';
  const numericValue = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px]">
        <span className="text-gray-500">{label}</span>
        <span className="tabular-nums text-gray-400">{numericValue}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
        <div className={`h-full rounded-full ${fillClass}`} style={{ width: `${numericValue}%`, opacity: 0.78 }} />
      </div>
    </div>
  );
}

export default function PublicPetShowcaseCard({
  pet,
  username = '',
  compact = false,
  className = '',
  titlePrefix = '',
  reaction = '',
}) {
  const accessories = useMemo(() => buildAccessoryList(pet), [pet]);
  const favorites = Array.isArray(pet?.minigames?.favorites) ? pet.minigames.favorites : [];
  if (!pet) return null;

  const petName = String(pet.nickname || pet.character || 'Pet').trim();
  const ownerLabel = String(username || '').trim();
  const title = ownerLabel
    ? `${ownerLabel}'s ${petName}`
    : petName;
  const subtitle = [
    pet.bond_rank?.label || 'Training Partner',
    pet.form?.label || '',
  ].filter(Boolean).join(' • ');
  const spriteSize = compact ? 74 : 100;

  return (
    <div className={`overflow-hidden rounded-[1.4rem] border border-white/[0.08] bg-[linear-gradient(180deg,#161827_0%,#0f1220_100%)] shadow-[0_18px_40px_rgba(0,0,0,0.28)] ${className}`}>
      <div className="bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_55%)] px-4 pb-4 pt-5">
        {titlePrefix ? (
          <p className="text-[9px] font-display font-bold uppercase tracking-[0.22em] text-cyan-200/70">{titlePrefix}</p>
        ) : null}
        <div className={`flex ${compact ? 'items-center gap-4' : 'flex-col items-center text-center'} mt-1`}>
          <div className={`shrink-0 rounded-[1.4rem] border border-white/[0.08] bg-black/20 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
            <SpritePet
              character={pet.character}
              weightState={pet.weight_state}
              mood={pet.mood}
              equippedHat={pet.equipped_hat}
              equippedBelt={pet.equipped_belt}
              equippedShoes={pet.equipped_shoes}
              equippedTop={pet.equipped_top}
              hatColor={pet.hat_color}
              beltColor={pet.belt_color}
              shoesColor={pet.shoes_color}
              topColor={pet.top_color}
              size={spriteSize}
              reaction={reaction}
            />
          </div>
          <div className={`min-w-0 ${compact ? 'flex-1' : 'mt-3'}`}>
            <p className={`font-display font-black text-white ${compact ? 'text-[18px]' : 'text-[17px]'}`}>{title}</p>
            {subtitle ? <p className="mt-1 text-[11px] text-cyan-100/80">{subtitle}</p> : null}
            <p className="mt-1.5 text-[11px] text-gray-300 italic">&ldquo;{MOOD_MESSAGES[pet.mood] || 'Hello!'}&rdquo;</p>
            <div className={`mt-2 flex flex-wrap gap-1.5 ${compact ? '' : 'justify-center'}`}>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold capitalize text-white/85">
                {pet.mood || 'happy'}
              </span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold text-white/85">
                Lv.{pet.level || 1}
              </span>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold capitalize text-white/85">
                {pet.weight_state || 'normal'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-4 pb-4">
        <div className="grid grid-cols-2 gap-3">
          <MiniMeter label="Hunger" value={pet.hunger} tone="orange" />
          <MiniMeter label="Happiness" value={pet.happiness} tone="pink" />
        </div>

        {accessories.length > 0 ? (
          <div>
            <p className="mb-1.5 text-[10px] font-display font-bold uppercase tracking-[0.2em] text-gray-500">Outfit</p>
            <div className="flex flex-wrap gap-1.5">
              {accessories.map((item) => (
                <span
                  key={`${item.slot}-${item.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold text-white/85"
                >
                  {item.color ? <span className="h-2 w-2 rounded-full border border-white/20" style={{ backgroundColor: item.color }} /> : null}
                  <span>{item.label}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <p className="text-[10px] font-display font-bold uppercase tracking-[0.2em] text-gray-500">Favorite Mini-Games</p>
            {Number(pet?.minigames?.total_plays) > 0 ? (
              <span className="text-[10px] text-gray-500">{pet.minigames.total_plays} total</span>
            ) : null}
          </div>
          {favorites.length > 0 ? (
            <div className="space-y-2">
              {favorites.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ACCENT_STYLES[entry.accent] || 'border-white/[0.08] bg-white/[0.04] text-white/85'}`}>
                      {entry.label}
                    </span>
                    <span className="text-[10px] font-semibold text-gray-400">{formatPlayCount(entry)}</span>
                  </div>
                  {entry.summary ? <p className="mt-1.5 text-[11px] text-gray-300">{entry.summary}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/[0.08] bg-black/15 px-3 py-3 text-[11px] text-gray-500">
              This pet is still choosing its favorite games.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
