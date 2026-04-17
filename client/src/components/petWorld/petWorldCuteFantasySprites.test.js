import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { inferPromotedGrassPathVariant } from './petWorldCuteFantasySprites.js';

describe('inferPromotedGrassPathVariant', () => {
  it('promotes a grass tile when stone surrounds all four quadrants', () => {
    const neighbors = {
      n_pathVariant: 'stone',
      s_pathVariant: 'stone',
      e_pathVariant: 'stone',
      w_pathVariant: 'stone',
      ne_pathVariant: 'stone',
      nw_pathVariant: 'stone',
      se_pathVariant: 'stone',
      sw_pathVariant: 'stone',
    };
    assert.equal(inferPromotedGrassPathVariant(neighbors), 'stone');
  });

  it('promotes a dirt courtyard pocket with strong cardinal support', () => {
    const neighbors = {
      n_pathVariant: 'dirt',
      s_pathVariant: 'dirt',
      e_pathVariant: 'dirt',
      w_pathVariant: null,
      ne_pathVariant: 'dirt',
      nw_pathVariant: null,
      se_pathVariant: 'dirt',
      sw_pathVariant: null,
    };
    assert.equal(inferPromotedGrassPathVariant(neighbors), 'dirt');
  });

  it('returns null for a normal edge tile with only a weak one-sided path touch', () => {
    const neighbors = {
      n_pathVariant: 'stone',
      s_pathVariant: null,
      e_pathVariant: null,
      w_pathVariant: null,
      ne_pathVariant: null,
      nw_pathVariant: null,
      se_pathVariant: null,
      sw_pathVariant: null,
    };
    assert.equal(inferPromotedGrassPathVariant(neighbors), null);
  });
});
