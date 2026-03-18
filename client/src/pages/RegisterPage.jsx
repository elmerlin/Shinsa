import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register, saveWorldMaxLocation } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import AvatarPicker from '../components/AvatarPicker';
import { useI18n } from '../i18n/TranslationContext';
import {
  SKILL_TITLES, SKILL_LEVELS, GENDER_OPTIONS, GENDER_SYMBOLS,
  COUNTRIES, getCountryFlag, getSkillColor,
} from '../components/PlayerRegistration';

function normalizeCountryString(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function resolveCountryCode(input) {
  const normalized = normalizeCountryString(input);
  if (!normalized) return '';
  for (const country of COUNTRIES) {
    if (!country.code) continue;
    if (normalizeCountryString(country.name) === normalized) return country.code;
    if (String(country.code).toLowerCase() === normalized) return country.code;
  }
  return '';
}

export default function RegisterPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { loginUser } = useAuth();
  const [form, setForm] = useState({
    username: '', password: '', confirmPassword: '', email: '',
    avatar: '', pumbility: '', skill_title: 'Beginner', skill_level: 1,
    gender: '', nationality: '', date_of_birth: '', show_age: false, description: '',
    location_country: '', location_city: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        username: form.username,
        password: form.password,
        email: form.email,
        avatar: form.avatar,
        pumbility: parseInt(form.pumbility) || 0,
        skill_title: `${form.skill_title} lvl. ${form.skill_level}`,
        skill_level: parseInt(form.skill_level) || 1,
        gender: form.gender,
        nationality: form.nationality,
        date_of_birth: form.date_of_birth,
        show_age: form.show_age,
        description: form.description,
        location_country: form.location_country,
        location_country_code: resolveCountryCode(form.location_country),
        location_city: form.location_city,
      };
      const { user, token } = await register(payload);
      loginUser(user, token);
      if (form.location_country.trim() && form.location_city.trim()) {
        await saveWorldMaxLocation({
          country: form.location_country,
          city: form.location_city,
          country_code: resolveCountryCode(form.location_country),
        }).catch(() => {});
      }
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <h1 className="text-3xl font-display font-bold tracking-wider text-center mb-6">{t('register.title')}</h1>

      <form onSubmit={handleSubmit} className="card space-y-4">
        {/* Avatar */}
        <AvatarPicker
          value={form.avatar}
          onChange={(avatar) => setForm(f => ({ ...f, avatar }))}
          shape="circle"
          size="md"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('login.pump_alias')} *</label>
            <input
              type="text"
              className="input-field"
              placeholder={t('register.username_placeholder')}
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              required
              autoFocus
              minLength={2}
              maxLength={30}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('register.email_optional')}</label>
            <input
              type="email"
              className="input-field"
              placeholder={t('register.email_placeholder')}
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('login.password')} *</label>
            <input
              type="password"
              className="input-field"
              placeholder={t('register.password_minimum')}
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              required
              minLength={4}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('register.confirm_password')} *</label>
            <input
              type="password"
              className="input-field"
              placeholder={t('register.confirm_password_placeholder')}
              value={form.confirmPassword}
              onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">{t('register.pumbility')}</label>
          <input
            type="number"
            className="input-field"
            placeholder={t('register.pumbility_placeholder')}
            value={form.pumbility}
            onChange={e => setForm(f => ({ ...f, pumbility: e.target.value }))}
          />
        </div>

        {/* Toggle for more details */}
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm text-piu-accent hover:underline font-display"
        >
          {showDetails ? t('register.hide_details') : t('register.more_details')}
        </button>

        {showDetails && (
          <div className="space-y-4 animate-slide-up">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('register.skill_title')}</label>
                <select
                  className="input-field"
                  value={form.skill_title}
                  onChange={e => setForm(f => ({ ...f, skill_title: e.target.value }))}
                >
                  {SKILL_TITLES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('register.skill_level')}</label>
                <select
                  className="input-field"
                  value={form.skill_level}
                  onChange={e => setForm(f => ({ ...f, skill_level: parseInt(e.target.value) }))}
                >
                  {SKILL_LEVELS.map(l => <option key={l} value={l}>Level {l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('register.gender')}</label>
                <select
                  className="input-field"
                  value={form.gender}
                  onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
                >
                  {GENDER_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('register.nationality')}</label>
                <select
                  className="input-field"
                  value={form.nationality}
                  onChange={e => setForm(f => ({ ...f, nationality: e.target.value }))}
                >
                  {COUNTRIES.map(c => (
                    <option key={c.code} value={c.code}>{c.flag ? `${c.flag} ` : ''}{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('register.date_of_birth')}</label>
                <input
                  type="date"
                  className="input-field"
                  value={form.date_of_birth}
                  onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))}
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.show_age}
                    onChange={e => setForm(f => ({ ...f, show_age: e.target.checked }))}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm text-gray-400">{t('register.show_age')}</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-1">{t('register.description')}</label>
              <textarea
                className="input-field resize-none"
                rows="2"
                placeholder={t('register.description_placeholder')}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('register.location_country')}</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Japan"
                  value={form.location_country}
                  onChange={e => setForm(f => ({ ...f, location_country: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('register.location_city')}</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="Tokyo"
                  value={form.location_city}
                  onChange={e => setForm(f => ({ ...f, location_city: e.target.value }))}
                />
              </div>
            </div>

            {/* Preview */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">{t('register.preview')}</span>
              {form.nationality && <span className="text-base">{getCountryFlag(form.nationality)}</span>}
              <span className={`badge border ${getSkillColor(form.skill_title)}`}>
                {form.skill_title} lvl. {form.skill_level}
              </span>
              {form.gender && (
                <span className={`text-sm ${form.gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>
                  {GENDER_SYMBOLS[form.gender]}
                </span>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? t('register.creating_account') : t('register.create_account')}
        </button>

        <p className="text-center text-sm text-gray-500">
          {t('register.already_have_account')}{' '}
          <Link to="/login" className="text-piu-accent hover:underline">{t('app.nav.login')}</Link>
        </p>
      </form>
    </div>
  );
}
