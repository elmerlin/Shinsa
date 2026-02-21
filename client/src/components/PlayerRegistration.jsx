import React, { useState, useCallback } from 'react';
import { createPlayer, updatePlayer, deletePlayer, searchUsers, sendInvitation } from '../utils/api';
import AvatarPicker, { getAvatarUrl } from './AvatarPicker';
import { Link } from 'react-router-dom';
import { getProfilePath } from '../utils/profile';

export const SKILL_TITLES = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
export const SKILL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const GENDER_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];
export const GENDER_SYMBOLS = { male: '\u2642', female: '\u2640' };

export const COUNTRIES = [
  { code: '', name: 'Not specified', flag: '' },
  { code: 'AF', name: 'Afghanistan', flag: '\u{1F1E6}\u{1F1EB}' },
  { code: 'AL', name: 'Albania', flag: '\u{1F1E6}\u{1F1F1}' },
  { code: 'DZ', name: 'Algeria', flag: '\u{1F1E9}\u{1F1FF}' },
  { code: 'AD', name: 'Andorra', flag: '\u{1F1E6}\u{1F1E9}' },
  { code: 'AO', name: 'Angola', flag: '\u{1F1E6}\u{1F1F4}' },
  { code: 'AG', name: 'Antigua and Barbuda', flag: '\u{1F1E6}\u{1F1EC}' },
  { code: 'AR', name: 'Argentina', flag: '\u{1F1E6}\u{1F1F7}' },
  { code: 'AM', name: 'Armenia', flag: '\u{1F1E6}\u{1F1F2}' },
  { code: 'AU', name: 'Australia', flag: '\u{1F1E6}\u{1F1FA}' },
  { code: 'AT', name: 'Austria', flag: '\u{1F1E6}\u{1F1F9}' },
  { code: 'AZ', name: 'Azerbaijan', flag: '\u{1F1E6}\u{1F1FF}' },
  { code: 'BS', name: 'Bahamas', flag: '\u{1F1E7}\u{1F1F8}' },
  { code: 'BH', name: 'Bahrain', flag: '\u{1F1E7}\u{1F1ED}' },
  { code: 'BD', name: 'Bangladesh', flag: '\u{1F1E7}\u{1F1E9}' },
  { code: 'BB', name: 'Barbados', flag: '\u{1F1E7}\u{1F1E7}' },
  { code: 'BY', name: 'Belarus', flag: '\u{1F1E7}\u{1F1FE}' },
  { code: 'BE', name: 'Belgium', flag: '\u{1F1E7}\u{1F1EA}' },
  { code: 'BZ', name: 'Belize', flag: '\u{1F1E7}\u{1F1FF}' },
  { code: 'BJ', name: 'Benin', flag: '\u{1F1E7}\u{1F1EF}' },
  { code: 'BT', name: 'Bhutan', flag: '\u{1F1E7}\u{1F1F9}' },
  { code: 'BO', name: 'Bolivia', flag: '\u{1F1E7}\u{1F1F4}' },
  { code: 'BA', name: 'Bosnia and Herzegovina', flag: '\u{1F1E7}\u{1F1E6}' },
  { code: 'BW', name: 'Botswana', flag: '\u{1F1E7}\u{1F1FC}' },
  { code: 'BR', name: 'Brazil', flag: '\u{1F1E7}\u{1F1F7}' },
  { code: 'BN', name: 'Brunei', flag: '\u{1F1E7}\u{1F1F3}' },
  { code: 'BG', name: 'Bulgaria', flag: '\u{1F1E7}\u{1F1EC}' },
  { code: 'BF', name: 'Burkina Faso', flag: '\u{1F1E7}\u{1F1EB}' },
  { code: 'BI', name: 'Burundi', flag: '\u{1F1E7}\u{1F1EE}' },
  { code: 'CV', name: 'Cabo Verde', flag: '\u{1F1E8}\u{1F1FB}' },
  { code: 'KH', name: 'Cambodia', flag: '\u{1F1F0}\u{1F1ED}' },
  { code: 'CM', name: 'Cameroon', flag: '\u{1F1E8}\u{1F1F2}' },
  { code: 'CA', name: 'Canada', flag: '\u{1F1E8}\u{1F1E6}' },
  { code: 'CF', name: 'Central African Republic', flag: '\u{1F1E8}\u{1F1EB}' },
  { code: 'TD', name: 'Chad', flag: '\u{1F1F9}\u{1F1E9}' },
  { code: 'CL', name: 'Chile', flag: '\u{1F1E8}\u{1F1F1}' },
  { code: 'CN', name: 'China', flag: '\u{1F1E8}\u{1F1F3}' },
  { code: 'CO', name: 'Colombia', flag: '\u{1F1E8}\u{1F1F4}' },
  { code: 'KM', name: 'Comoros', flag: '\u{1F1F0}\u{1F1F2}' },
  { code: 'CG', name: 'Congo', flag: '\u{1F1E8}\u{1F1EC}' },
  { code: 'CD', name: 'Congo (DRC)', flag: '\u{1F1E8}\u{1F1E9}' },
  { code: 'CR', name: 'Costa Rica', flag: '\u{1F1E8}\u{1F1F7}' },
  { code: 'CI', name: "C\u00f4te d'Ivoire", flag: '\u{1F1E8}\u{1F1EE}' },
  { code: 'HR', name: 'Croatia', flag: '\u{1F1ED}\u{1F1F7}' },
  { code: 'CU', name: 'Cuba', flag: '\u{1F1E8}\u{1F1FA}' },
  { code: 'CY', name: 'Cyprus', flag: '\u{1F1E8}\u{1F1FE}' },
  { code: 'CZ', name: 'Czechia', flag: '\u{1F1E8}\u{1F1FF}' },
  { code: 'DK', name: 'Denmark', flag: '\u{1F1E9}\u{1F1F0}' },
  { code: 'DJ', name: 'Djibouti', flag: '\u{1F1E9}\u{1F1EF}' },
  { code: 'DM', name: 'Dominica', flag: '\u{1F1E9}\u{1F1F2}' },
  { code: 'DO', name: 'Dominican Republic', flag: '\u{1F1E9}\u{1F1F4}' },
  { code: 'EC', name: 'Ecuador', flag: '\u{1F1EA}\u{1F1E8}' },
  { code: 'EG', name: 'Egypt', flag: '\u{1F1EA}\u{1F1EC}' },
  { code: 'SV', name: 'El Salvador', flag: '\u{1F1F8}\u{1F1FB}' },
  { code: 'GQ', name: 'Equatorial Guinea', flag: '\u{1F1EC}\u{1F1F6}' },
  { code: 'ER', name: 'Eritrea', flag: '\u{1F1EA}\u{1F1F7}' },
  { code: 'EE', name: 'Estonia', flag: '\u{1F1EA}\u{1F1EA}' },
  { code: 'SZ', name: 'Eswatini', flag: '\u{1F1F8}\u{1F1FF}' },
  { code: 'ET', name: 'Ethiopia', flag: '\u{1F1EA}\u{1F1F9}' },
  { code: 'FJ', name: 'Fiji', flag: '\u{1F1EB}\u{1F1EF}' },
  { code: 'FI', name: 'Finland', flag: '\u{1F1EB}\u{1F1EE}' },
  { code: 'FR', name: 'France', flag: '\u{1F1EB}\u{1F1F7}' },
  { code: 'GA', name: 'Gabon', flag: '\u{1F1EC}\u{1F1E6}' },
  { code: 'GM', name: 'Gambia', flag: '\u{1F1EC}\u{1F1F2}' },
  { code: 'GE', name: 'Georgia', flag: '\u{1F1EC}\u{1F1EA}' },
  { code: 'DE', name: 'Germany', flag: '\u{1F1E9}\u{1F1EA}' },
  { code: 'GH', name: 'Ghana', flag: '\u{1F1EC}\u{1F1ED}' },
  { code: 'GR', name: 'Greece', flag: '\u{1F1EC}\u{1F1F7}' },
  { code: 'GD', name: 'Grenada', flag: '\u{1F1EC}\u{1F1E9}' },
  { code: 'GT', name: 'Guatemala', flag: '\u{1F1EC}\u{1F1F9}' },
  { code: 'GN', name: 'Guinea', flag: '\u{1F1EC}\u{1F1F3}' },
  { code: 'GW', name: 'Guinea-Bissau', flag: '\u{1F1EC}\u{1F1FC}' },
  { code: 'GY', name: 'Guyana', flag: '\u{1F1EC}\u{1F1FE}' },
  { code: 'HT', name: 'Haiti', flag: '\u{1F1ED}\u{1F1F9}' },
  { code: 'HN', name: 'Honduras', flag: '\u{1F1ED}\u{1F1F3}' },
  { code: 'HK', name: 'Hong Kong', flag: '\u{1F1ED}\u{1F1F0}' },
  { code: 'HU', name: 'Hungary', flag: '\u{1F1ED}\u{1F1FA}' },
  { code: 'IS', name: 'Iceland', flag: '\u{1F1EE}\u{1F1F8}' },
  { code: 'IN', name: 'India', flag: '\u{1F1EE}\u{1F1F3}' },
  { code: 'ID', name: 'Indonesia', flag: '\u{1F1EE}\u{1F1E9}' },
  { code: 'IR', name: 'Iran', flag: '\u{1F1EE}\u{1F1F7}' },
  { code: 'IQ', name: 'Iraq', flag: '\u{1F1EE}\u{1F1F6}' },
  { code: 'IE', name: 'Ireland', flag: '\u{1F1EE}\u{1F1EA}' },
  { code: 'IL', name: 'Israel', flag: '\u{1F1EE}\u{1F1F1}' },
  { code: 'IT', name: 'Italy', flag: '\u{1F1EE}\u{1F1F9}' },
  { code: 'JM', name: 'Jamaica', flag: '\u{1F1EF}\u{1F1F2}' },
  { code: 'JP', name: 'Japan', flag: '\u{1F1EF}\u{1F1F5}' },
  { code: 'JO', name: 'Jordan', flag: '\u{1F1EF}\u{1F1F4}' },
  { code: 'KZ', name: 'Kazakhstan', flag: '\u{1F1F0}\u{1F1FF}' },
  { code: 'KE', name: 'Kenya', flag: '\u{1F1F0}\u{1F1EA}' },
  { code: 'KI', name: 'Kiribati', flag: '\u{1F1F0}\u{1F1EE}' },
  { code: 'KP', name: 'North Korea', flag: '\u{1F1F0}\u{1F1F5}' },
  { code: 'KR', name: 'South Korea', flag: '\u{1F1F0}\u{1F1F7}' },
  { code: 'KW', name: 'Kuwait', flag: '\u{1F1F0}\u{1F1FC}' },
  { code: 'KG', name: 'Kyrgyzstan', flag: '\u{1F1F0}\u{1F1EC}' },
  { code: 'LA', name: 'Laos', flag: '\u{1F1F1}\u{1F1E6}' },
  { code: 'LV', name: 'Latvia', flag: '\u{1F1F1}\u{1F1FB}' },
  { code: 'LB', name: 'Lebanon', flag: '\u{1F1F1}\u{1F1E7}' },
  { code: 'LS', name: 'Lesotho', flag: '\u{1F1F1}\u{1F1F8}' },
  { code: 'LR', name: 'Liberia', flag: '\u{1F1F1}\u{1F1F7}' },
  { code: 'LY', name: 'Libya', flag: '\u{1F1F1}\u{1F1FE}' },
  { code: 'LI', name: 'Liechtenstein', flag: '\u{1F1F1}\u{1F1EE}' },
  { code: 'LT', name: 'Lithuania', flag: '\u{1F1F1}\u{1F1F9}' },
  { code: 'LU', name: 'Luxembourg', flag: '\u{1F1F1}\u{1F1FA}' },
  { code: 'MO', name: 'Macau', flag: '\u{1F1F2}\u{1F1F4}' },
  { code: 'MG', name: 'Madagascar', flag: '\u{1F1F2}\u{1F1EC}' },
  { code: 'MW', name: 'Malawi', flag: '\u{1F1F2}\u{1F1FC}' },
  { code: 'MY', name: 'Malaysia', flag: '\u{1F1F2}\u{1F1FE}' },
  { code: 'MV', name: 'Maldives', flag: '\u{1F1F2}\u{1F1FB}' },
  { code: 'ML', name: 'Mali', flag: '\u{1F1F2}\u{1F1F1}' },
  { code: 'MT', name: 'Malta', flag: '\u{1F1F2}\u{1F1F9}' },
  { code: 'MH', name: 'Marshall Islands', flag: '\u{1F1F2}\u{1F1ED}' },
  { code: 'MR', name: 'Mauritania', flag: '\u{1F1F2}\u{1F1F7}' },
  { code: 'MU', name: 'Mauritius', flag: '\u{1F1F2}\u{1F1FA}' },
  { code: 'MX', name: 'Mexico', flag: '\u{1F1F2}\u{1F1FD}' },
  { code: 'FM', name: 'Micronesia', flag: '\u{1F1EB}\u{1F1F2}' },
  { code: 'MD', name: 'Moldova', flag: '\u{1F1F2}\u{1F1E9}' },
  { code: 'MC', name: 'Monaco', flag: '\u{1F1F2}\u{1F1E8}' },
  { code: 'MN', name: 'Mongolia', flag: '\u{1F1F2}\u{1F1F3}' },
  { code: 'ME', name: 'Montenegro', flag: '\u{1F1F2}\u{1F1EA}' },
  { code: 'MA', name: 'Morocco', flag: '\u{1F1F2}\u{1F1E6}' },
  { code: 'MZ', name: 'Mozambique', flag: '\u{1F1F2}\u{1F1FF}' },
  { code: 'MM', name: 'Myanmar', flag: '\u{1F1F2}\u{1F1F2}' },
  { code: 'NA', name: 'Namibia', flag: '\u{1F1F3}\u{1F1E6}' },
  { code: 'NR', name: 'Nauru', flag: '\u{1F1F3}\u{1F1F7}' },
  { code: 'NP', name: 'Nepal', flag: '\u{1F1F3}\u{1F1F5}' },
  { code: 'NL', name: 'Netherlands', flag: '\u{1F1F3}\u{1F1F1}' },
  { code: 'NZ', name: 'New Zealand', flag: '\u{1F1F3}\u{1F1FF}' },
  { code: 'NI', name: 'Nicaragua', flag: '\u{1F1F3}\u{1F1EE}' },
  { code: 'NE', name: 'Niger', flag: '\u{1F1F3}\u{1F1EA}' },
  { code: 'NG', name: 'Nigeria', flag: '\u{1F1F3}\u{1F1EC}' },
  { code: 'MK', name: 'North Macedonia', flag: '\u{1F1F2}\u{1F1F0}' },
  { code: 'NO', name: 'Norway', flag: '\u{1F1F3}\u{1F1F4}' },
  { code: 'OM', name: 'Oman', flag: '\u{1F1F4}\u{1F1F2}' },
  { code: 'PK', name: 'Pakistan', flag: '\u{1F1F5}\u{1F1F0}' },
  { code: 'PW', name: 'Palau', flag: '\u{1F1F5}\u{1F1FC}' },
  { code: 'PS', name: 'Palestine', flag: '\u{1F1F5}\u{1F1F8}' },
  { code: 'PA', name: 'Panama', flag: '\u{1F1F5}\u{1F1E6}' },
  { code: 'PG', name: 'Papua New Guinea', flag: '\u{1F1F5}\u{1F1EC}' },
  { code: 'PY', name: 'Paraguay', flag: '\u{1F1F5}\u{1F1FE}' },
  { code: 'PE', name: 'Peru', flag: '\u{1F1F5}\u{1F1EA}' },
  { code: 'PH', name: 'Philippines', flag: '\u{1F1F5}\u{1F1ED}' },
  { code: 'PL', name: 'Poland', flag: '\u{1F1F5}\u{1F1F1}' },
  { code: 'PT', name: 'Portugal', flag: '\u{1F1F5}\u{1F1F9}' },
  { code: 'PR', name: 'Puerto Rico', flag: '\u{1F1F5}\u{1F1F7}' },
  { code: 'QA', name: 'Qatar', flag: '\u{1F1F6}\u{1F1E6}' },
  { code: 'RO', name: 'Romania', flag: '\u{1F1F7}\u{1F1F4}' },
  { code: 'RU', name: 'Russia', flag: '\u{1F1F7}\u{1F1FA}' },
  { code: 'RW', name: 'Rwanda', flag: '\u{1F1F7}\u{1F1FC}' },
  { code: 'KN', name: 'Saint Kitts and Nevis', flag: '\u{1F1F0}\u{1F1F3}' },
  { code: 'LC', name: 'Saint Lucia', flag: '\u{1F1F1}\u{1F1E8}' },
  { code: 'VC', name: 'Saint Vincent and the Grenadines', flag: '\u{1F1FB}\u{1F1E8}' },
  { code: 'WS', name: 'Samoa', flag: '\u{1F1FC}\u{1F1F8}' },
  { code: 'SM', name: 'San Marino', flag: '\u{1F1F8}\u{1F1F2}' },
  { code: 'ST', name: 'S\u00e3o Tom\u00e9 and Pr\u00edncipe', flag: '\u{1F1F8}\u{1F1F9}' },
  { code: 'SA', name: 'Saudi Arabia', flag: '\u{1F1F8}\u{1F1E6}' },
  { code: 'SN', name: 'Senegal', flag: '\u{1F1F8}\u{1F1F3}' },
  { code: 'RS', name: 'Serbia', flag: '\u{1F1F7}\u{1F1F8}' },
  { code: 'SC', name: 'Seychelles', flag: '\u{1F1F8}\u{1F1E8}' },
  { code: 'SL', name: 'Sierra Leone', flag: '\u{1F1F8}\u{1F1F1}' },
  { code: 'SG', name: 'Singapore', flag: '\u{1F1F8}\u{1F1EC}' },
  { code: 'SK', name: 'Slovakia', flag: '\u{1F1F8}\u{1F1F0}' },
  { code: 'SI', name: 'Slovenia', flag: '\u{1F1F8}\u{1F1EE}' },
  { code: 'SB', name: 'Solomon Islands', flag: '\u{1F1F8}\u{1F1E7}' },
  { code: 'SO', name: 'Somalia', flag: '\u{1F1F8}\u{1F1F4}' },
  { code: 'ZA', name: 'South Africa', flag: '\u{1F1FF}\u{1F1E6}' },
  { code: 'SS', name: 'South Sudan', flag: '\u{1F1F8}\u{1F1F8}' },
  { code: 'ES', name: 'Spain', flag: '\u{1F1EA}\u{1F1F8}' },
  { code: 'LK', name: 'Sri Lanka', flag: '\u{1F1F1}\u{1F1F0}' },
  { code: 'SD', name: 'Sudan', flag: '\u{1F1F8}\u{1F1E9}' },
  { code: 'SR', name: 'Suriname', flag: '\u{1F1F8}\u{1F1F7}' },
  { code: 'SE', name: 'Sweden', flag: '\u{1F1F8}\u{1F1EA}' },
  { code: 'CH', name: 'Switzerland', flag: '\u{1F1E8}\u{1F1ED}' },
  { code: 'SY', name: 'Syria', flag: '\u{1F1F8}\u{1F1FE}' },
  { code: 'TW', name: 'Taiwan', flag: '\u{1F1F9}\u{1F1FC}' },
  { code: 'TJ', name: 'Tajikistan', flag: '\u{1F1F9}\u{1F1EF}' },
  { code: 'TZ', name: 'Tanzania', flag: '\u{1F1F9}\u{1F1FF}' },
  { code: 'TH', name: 'Thailand', flag: '\u{1F1F9}\u{1F1ED}' },
  { code: 'TL', name: 'Timor-Leste', flag: '\u{1F1F9}\u{1F1F1}' },
  { code: 'TG', name: 'Togo', flag: '\u{1F1F9}\u{1F1EC}' },
  { code: 'TO', name: 'Tonga', flag: '\u{1F1F9}\u{1F1F4}' },
  { code: 'TT', name: 'Trinidad and Tobago', flag: '\u{1F1F9}\u{1F1F9}' },
  { code: 'TN', name: 'Tunisia', flag: '\u{1F1F9}\u{1F1F3}' },
  { code: 'TR', name: 'Turkey', flag: '\u{1F1F9}\u{1F1F7}' },
  { code: 'TM', name: 'Turkmenistan', flag: '\u{1F1F9}\u{1F1F2}' },
  { code: 'TV', name: 'Tuvalu', flag: '\u{1F1F9}\u{1F1FB}' },
  { code: 'UG', name: 'Uganda', flag: '\u{1F1FA}\u{1F1EC}' },
  { code: 'UA', name: 'Ukraine', flag: '\u{1F1FA}\u{1F1E6}' },
  { code: 'AE', name: 'United Arab Emirates', flag: '\u{1F1E6}\u{1F1EA}' },
  { code: 'GB', name: 'United Kingdom', flag: '\u{1F1EC}\u{1F1E7}' },
  { code: 'US', name: 'United States', flag: '\u{1F1FA}\u{1F1F8}' },
  { code: 'UY', name: 'Uruguay', flag: '\u{1F1FA}\u{1F1FE}' },
  { code: 'UZ', name: 'Uzbekistan', flag: '\u{1F1FA}\u{1F1FF}' },
  { code: 'VU', name: 'Vanuatu', flag: '\u{1F1FB}\u{1F1FA}' },
  { code: 'VA', name: 'Vatican City', flag: '\u{1F1FB}\u{1F1E6}' },
  { code: 'VE', name: 'Venezuela', flag: '\u{1F1FB}\u{1F1EA}' },
  { code: 'VN', name: 'Vietnam', flag: '\u{1F1FB}\u{1F1F3}' },
  { code: 'YE', name: 'Yemen', flag: '\u{1F1FE}\u{1F1EA}' },
  { code: 'ZM', name: 'Zambia', flag: '\u{1F1FF}\u{1F1F2}' },
  { code: 'ZW', name: 'Zimbabwe', flag: '\u{1F1FF}\u{1F1FC}' },
];

const COUNTRY_MAP = {};
COUNTRIES.forEach(c => { if (c.code) COUNTRY_MAP[c.code] = c; });

export function getCountryFlag(code, className) {
  if (!code) return null;
  const country = COUNTRY_MAP[code];
  if (!country) return null;
  // Emoji flags on mobile (renders natively on iOS/Android), CDN images on desktop (Windows doesn't render flag emojis)
  const sizeClass = className
    ? className.replace(/\binline-block\b\s*/g, '').trim()
    : "h-[1.1em] align-middle";
  return (
    <>
      <span className="sm:hidden">{country.flag}</span>
      <img src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`} alt={country.name} className={`hidden sm:inline-block ${sizeClass}`} draggable={false} />
    </>
  );
}

export const skillColors = {
  Beginner: 'bg-green-500/20 text-green-400 border-green-500/30',
  Intermediate: 'bg-piu-bronze/20 text-piu-bronze border-piu-bronze/30',
  Advanced: 'bg-piu-silver/20 text-piu-silver border-piu-silver/30',
  Expert: 'bg-piu-gold/20 text-piu-gold border-piu-gold/30',
};

export const getSkillColor = (title) => {
  if (!title) return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  for (const [key, val] of Object.entries(skillColors)) {
    if (title.startsWith(key)) return val;
  }
  return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
};

const getInitials = (name) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

const avatarColors = [
  'from-piu-accent to-purple-700',
  'from-blue-500 to-cyan-500',
  'from-green-500 to-emerald-500',
  'from-orange-500 to-red-500',
  'from-pink-500 to-rose-500',
  'from-yellow-500 to-amber-500',
  'from-indigo-500 to-violet-500',
  'from-teal-500 to-green-500',
];

export default function PlayerRegistration({ tournamentId, players, isSetup, onUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [form, setForm] = useState({
    name: '', skill_title: 'Beginner', skill_level: 1, pumbility: '', description: '', avatar: '', gender: '', nationality: '', user_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [inviteSent, setInviteSent] = useState({});

  const handleUserSearch = useCallback(async (q) => {
    if (q.length < 1) { setUserResults([]); return; }
    setSearching(true);
    try {
      const results = await searchUsers(q);
      setUserResults(results);
    } catch (e) {
      setUserResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const fillFromUser = (user) => {
    const titleParts = (user.skill_title || '').match(/^(Beginner|Intermediate|Advanced|Expert)\s*lvl\.\s*(\d+)/);
    setForm({
      name: user.username,
      skill_title: titleParts ? titleParts[1] : 'Beginner',
      skill_level: titleParts ? parseInt(titleParts[2]) : 1,
      pumbility: user.pumbility || '',
      description: user.description || '',
      avatar: user.avatar || '',
      gender: user.gender || '',
      nationality: user.nationality || '',
      user_id: user.id,
    });
    setUserSearch('');
    setUserResults([]);
  };

  const handleInviteUser = async (user) => {
    try {
      await sendInvitation({ user_id: user.id, type: 'tournament', tournament_id: tournamentId });
      setInviteSent(prev => ({ ...prev, [user.id]: true }));
    } catch (err) {
      alert(err.message);
    }
  };

  const resetForm = () => {
    setForm({ name: '', skill_title: 'Beginner', skill_level: 1, pumbility: '', description: '', avatar: '', gender: '', nationality: '', user_id: '' });
    setEditingPlayer(null);
    setUserSearch('');
    setUserResults([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        skill_title: `${form.skill_title} lvl. ${form.skill_level}`,
        skill_level: parseInt(form.skill_level) || 1,
        description: form.description,
        avatar: form.avatar,
        gender: form.gender,
        nationality: form.nationality,
      };

      if (editingPlayer) {
        await updatePlayer(editingPlayer.id, payload);
      } else {
        await createPlayer({
          tournament_id: tournamentId,
          pumbility: parseInt(form.pumbility) || 0,
          user_id: form.user_id || '',
          ...payload,
        });
      }
      resetForm();
      setShowForm(false);
      onUpdate();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (player) => {
    const titleParts = (player.skill_title || '').match(/^(Beginner|Intermediate|Advanced|Expert)\s*lvl\.\s*(\d+)/);
    setForm({
      name: player.name,
      skill_title: titleParts ? titleParts[1] : 'Beginner',
      skill_level: titleParts ? parseInt(titleParts[2]) : (player.skill_level || 1),
      pumbility: player.pumbility || '',
      description: player.description || '',
      avatar: player.avatar || '',
      gender: player.gender || '',
      nationality: player.nationality || '',
    });
    setEditingPlayer(player);
    setShowForm(true);
  };

  const handleDelete = async (playerId) => {
    if (!confirm('Remove this player?')) return;
    await deletePlayer(playerId);
    onUpdate();
  };

  const handleCancel = () => {
    resetForm();
    setShowForm(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="section-title">Players ({players.length})</h2>
        {!showForm && (
          <button onClick={() => { resetForm(); setShowForm(true); }} className="btn-primary">
            {isSetup ? '+ Add Player' : 'Edit Players'}
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card mb-6 space-y-4 animate-slide-up">
          <h3 className="font-display font-bold text-piu-accent">
            {editingPlayer ? `Edit: ${editingPlayer.name}` : 'Add New Player'}
          </h3>

          {/* Search registered users */}
          {!editingPlayer && (
            <div className="space-y-2">
              <label className="block text-sm text-gray-400">Search registered players</label>
              <input
                type="text"
                className="input-field"
                placeholder="Type a username to search..."
                value={userSearch}
                onChange={e => {
                  setUserSearch(e.target.value);
                  handleUserSearch(e.target.value);
                }}
              />
              {form.user_id && (
                <div className="flex items-center gap-2 text-xs text-piu-green bg-piu-green/10 px-3 py-1.5 rounded-lg">
                  <span>Linked to registered user: <strong>{form.name}</strong></span>
                  <button type="button" onClick={() => setForm(f => ({ ...f, user_id: '' }))} className="text-gray-400 hover:text-red-400 ml-auto">
                    &#10005;
                  </button>
                </div>
              )}
              {userResults.length > 0 && (
                <div className="bg-piu-dark border border-piu-border rounded-lg overflow-hidden">
                  {userResults.map(u => (
                    <div key={u.id} className="flex items-center gap-3 px-3 py-2 hover:bg-piu-card/50 transition-colors border-b border-piu-border/50 last:border-0">
                      {u.avatar ? (
                        <img src={getAvatarUrl(u.avatar)} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-piu-accent to-purple-700 flex items-center justify-center font-display font-bold text-xs shrink-0">
                          {u.username[0].toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-display font-bold truncate">{u.username}</p>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          {u.nationality && <span>{getCountryFlag(u.nationality)}</span>}
                          {u.skill_title && <span className={`badge border text-[10px] ${getSkillColor(u.skill_title)}`}>{u.skill_title}</span>}
                          {u.pumbility > 0 && <span className="text-piu-gold font-mono">{u.pumbility}</span>}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => fillFromUser(u)}
                          className="px-2 py-1 bg-piu-accent/20 text-piu-accent text-xs font-display font-bold rounded hover:bg-piu-accent/30 transition-colors"
                        >
                          Add directly
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInviteUser(u)}
                          disabled={inviteSent[u.id]}
                          className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-display font-bold rounded hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                        >
                          {inviteSent[u.id] ? 'Sent' : 'Invite'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {searching && <p className="text-xs text-gray-500">Searching...</p>}
            </div>
          )}

          {/* Avatar picker */}
          <AvatarPicker
            value={form.avatar}
            onChange={(avatar) => setForm(f => ({ ...f, avatar }))}
            shape="circle"
            size="md"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Player Name *</label>
              <input
                type="text"
                className="input-field"
                placeholder="Player name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
                autoFocus
              />
            </div>
            {!editingPlayer ? (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Pumbility (Seeding)</label>
                <input
                  type="number"
                  className="input-field"
                  placeholder="e.g. 2500"
                  value={form.pumbility}
                  onChange={e => setForm(f => ({ ...f, pumbility: e.target.value }))}
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm text-gray-400 mb-1">Pumbility (locked)</label>
                <input
                  type="number"
                  className="input-field opacity-50"
                  value={editingPlayer.pumbility || 0}
                  disabled
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Skill Title</label>
              <select
                className="input-field"
                value={form.skill_title}
                onChange={e => setForm(f => ({ ...f, skill_title: e.target.value }))}
              >
                {SKILL_TITLES.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Skill Level</label>
              <select
                className="input-field"
                value={form.skill_level}
                onChange={e => setForm(f => ({ ...f, skill_level: parseInt(e.target.value) }))}
              >
                {SKILL_LEVELS.map(l => (
                  <option key={l} value={l}>Level {l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Gender</label>
              <select
                className="input-field"
                value={form.gender}
                onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
              >
                {GENDER_OPTIONS.map(g => (
                  <option key={g.value} value={g.value}>{g.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nationality</label>
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

          <div>
            <label className="block text-sm text-gray-400 mb-1">Description</label>
            <textarea
              className="input-field resize-none"
              rows="2"
              placeholder="Short bio or notes about the player..."
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />
          </div>

          {/* Skill preview */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-500">Preview:</span>
            {form.nationality && (
              <span className="text-base">{getCountryFlag(form.nationality)}</span>
            )}
            <span className={`badge border ${getSkillColor(form.skill_title)}`}>
              {form.skill_title} lvl. {form.skill_level}
            </span>
            {form.gender && (
              <span className={`text-sm ${form.gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>
                {GENDER_SYMBOLS[form.gender]}
              </span>
            )}
          </div>

          <div className="flex gap-3">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Saving...' : editingPlayer ? 'Save Changes' : 'Add Player'}
            </button>
            <button type="button" onClick={handleCancel} className="btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-3">
        {players.map((player, idx) => {
          const genderSymbol = player.gender ? GENDER_SYMBOLS[player.gender] || '' : '';
          const flag = getCountryFlag(player.nationality);

          return (
            <div key={player.id} className="card flex items-center gap-3 sm:gap-4 group">
              <div className="text-gray-600 font-mono text-sm w-6 text-right shrink-0">
                #{idx + 1}
              </div>

              {player.avatar ? (
                <img src={getAvatarUrl(player.avatar)} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
              ) : (
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarColors[idx % avatarColors.length]} flex items-center justify-center font-display font-bold text-sm shrink-0`}>
                  {getInitials(player.name)}
                </div>
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {flag && <span className="text-base shrink-0">{flag}</span>}
                  {player.user_id ? (
                    <Link to={getProfilePath(player.user_id, player.name)} className="font-display font-bold text-piu-accent hover:underline">
                      {player.name}
                    </Link>
                  ) : (
                    <span className="font-display font-bold">{player.name}</span>
                  )}
                  {genderSymbol && (
                    <span className={`text-sm ${player.gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>
                      {genderSymbol}
                    </span>
                  )}
                  {player.skill_title && (
                    <span className={`badge border ${getSkillColor(player.skill_title)}`}>
                      {player.skill_title}
                    </span>
                  )}
                </div>
                {player.description && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">{player.description}</p>
                )}
              </div>

              <div className="text-right shrink-0">
                {player.pumbility > 0 && (
                  <div className="text-sm text-piu-gold font-mono font-bold">{player.pumbility.toLocaleString()}</div>
                )}
                <div className="text-xs text-gray-500">
                  {player.wins}W - {player.losses}L
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => handleEdit(player)}
                  className="text-gray-600 hover:text-piu-accent transition-colors sm:opacity-0 sm:group-hover:opacity-100 p-1"
                  title="Edit player"
                >
                  &#9998;
                </button>
                {isSetup && (
                  <button
                    onClick={() => handleDelete(player.id)}
                    className="text-gray-600 hover:text-red-500 transition-colors sm:opacity-0 sm:group-hover:opacity-100 p-1"
                    title="Delete player"
                  >
                    &#10005;
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {players.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p className="text-lg">No players registered yet</p>
          {isSetup && <p className="text-sm mt-1">Click "+ Add Player" to register participants</p>}
        </div>
      )}
    </div>
  );
}
