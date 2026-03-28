import React, { useState, useCallback } from 'react';
import { createPlayer, deletePlayer, searchUsers, sendInvitation } from '../utils/api';
import { getAvatarUrl } from './AvatarPicker';
import { Link } from 'react-router-dom';
import { getProfilePath } from '../utils/profile';
import SeedingPanel from './tournament/SeedingPanel';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';

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

function MetaPill({ children }) {
  if (!children) return null;
  return (
    <span className="inline-flex items-center rounded-full border border-white/8 bg-white/6 px-2.5 py-1 text-[11px] text-zinc-300">
      {children}
    </span>
  );
}

export default function PlayerRegistration({ tournamentId, players, isSetup, onUpdate }) {
  const [showForm, setShowForm] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [userResults, setUserResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [inviteSent, setInviteSent] = useState({});
  const [savingUserId, setSavingUserId] = useState('');

  const registeredUserIds = new Set(
    players
      .map((player) => String(player.user_id || '').trim())
      .filter(Boolean)
  );

  const handleUserSearch = useCallback(async (q) => {
    const query = String(q || '').trim();
    if (query.length < 1) { setUserResults([]); return; }
    setSearching(true);
    try {
      const results = await searchUsers(query);
      setUserResults(results);
    } catch (e) {
      setUserResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleInviteUser = async (user) => {
    try {
      await sendInvitation({ user_id: user.id, type: 'tournament', tournament_id: tournamentId });
      setInviteSent(prev => ({ ...prev, [user.id]: true }));
    } catch (err) {
      alert(err.message);
    }
  };

  const resetPicker = () => {
    setUserSearch('');
    setUserResults([]);
  };

  const handleAddUser = async (user) => {
    if (!user?.id || registeredUserIds.has(String(user.id))) return;
    setSavingUserId(String(user.id));
    try {
      await createPlayer({
        tournament_id: tournamentId,
        user_id: user.id,
      });
      resetPicker();
      onUpdate();
    } catch (err) {
      alert(err.message);
    } finally {
      setSavingUserId('');
    }
  };

  const handleDelete = async (playerId) => {
    if (!confirm('Remove this player?')) return;
    try {
      await deletePlayer(playerId);
      onUpdate();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="section-title">Players ({players.length})</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Add registered Shinsa players. Profile details stay read-only here.
          </p>
        </div>
        {isSetup && !showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="btn-primary"
          >
            + Add Registered Player
          </button>
        )}
      </div>

      {isSetup && (
        <Card className="overflow-hidden border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(255,51,102,0.14),transparent_36%),radial-gradient(circle_at_82%_20%,rgba(255,199,92,0.12),transparent_28%),rgba(9,12,22,0.92)]">
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-display text-base font-bold text-white">Registered players only</p>
                <p className="mt-1 max-w-2xl text-sm text-zinc-300">
                  Search Shinsa members and add them to the bracket. Profiles stay read-only here.
                </p>
              </div>
              {showForm && (
                <button
                  type="button"
                  onClick={() => {
                    resetPicker();
                    setShowForm(false);
                  }}
                  className="btn-secondary"
                >
                  Close
                </button>
              )}
            </div>

            {showForm ? (
              <div className="border-t border-white/8 pt-4">
                <label className="block text-sm text-zinc-300">Find a player</label>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Search username"
                    value={userSearch}
                    onChange={(event) => {
                      const value = event.target.value;
                      setUserSearch(value);
                      handleUserSearch(value);
                    }}
                    autoFocus
                  />
                </div>

                {searching && <p className="mt-4 text-sm text-zinc-500">Searching players...</p>}
                {!searching && userSearch.trim() && userResults.length === 0 && (
                  <p className="mt-4 text-sm text-zinc-500">No players matched that search.</p>
                )}
                {!searching && !userSearch.trim() && (
                  <p className="mt-4 text-sm text-zinc-500">Start typing to search registered players.</p>
                )}

                {userResults.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {userResults.map((user) => {
                      const alreadyAdded = registeredUserIds.has(String(user.id || '').trim());
                      const isSaving = savingUserId === String(user.id);
                      return (
                        <div
                          key={user.id}
                          className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/18 p-3 sm:flex-row sm:items-center"
                        >
                          {user.avatar ? (
                            <img
                              src={getAvatarUrl(user.avatar)}
                              alt=""
                              className="h-11 w-11 rounded-full object-cover ring-1 ring-white/10"
                            />
                          ) : (
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-piu-accent to-purple-700 font-display text-sm font-bold text-white ring-1 ring-white/10">
                              {String(user.username || '?').charAt(0).toUpperCase()}
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-display text-sm font-bold text-white">{user.username}</p>
                              {user.nationality ? <span className="text-base">{getCountryFlag(user.nationality)}</span> : null}
                              <Badge variant={alreadyAdded ? 'warning' : 'default'} className={alreadyAdded ? '' : 'border-piu-accent/20 bg-piu-accent/10 text-rose-100'}>
                                {alreadyAdded ? 'Already Added' : 'Registered'}
                              </Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                              {user.skill_title ? (
                                <span className={`badge border ${getSkillColor(user.skill_title)}`}>{user.skill_title}</span>
                              ) : null}
                              {user.pumbility > 0 ? (
                                <MetaPill>{Number(user.pumbility).toLocaleString()} pumbility</MetaPill>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <button
                              type="button"
                              onClick={() => handleAddUser(user)}
                              disabled={alreadyAdded || isSaving}
                              className="btn-primary"
                            >
                              {alreadyAdded ? 'Added' : isSaving ? 'Adding...' : 'Add Player'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleInviteUser(user)}
                              disabled={inviteSent[user.id]}
                              className="btn-secondary"
                            >
                              {inviteSent[user.id] ? 'Invite Sent' : 'Invite'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="border-t border-white/8 pt-4 text-sm text-zinc-400">
                Open the picker to search and add players.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {players.length === 0 ? (
        <Card className="border-dashed border-white/10 bg-zinc-950/45">
          <CardContent className="py-12 text-center">
            <p className="text-lg font-display font-bold text-zinc-200">No players registered yet</p>
            <p className="mt-2 text-sm text-zinc-500">
              {isSetup ? 'Use Add Registered Player to build the bracket.' : 'Players will appear here once the organizer adds them.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {players.map((player, idx) => {
            const genderSymbol = player.gender ? GENDER_SYMBOLS[player.gender] || '' : '';
            const flag = getCountryFlag(player.nationality);

            return (
              <Card key={player.id} className="overflow-hidden border-white/8 bg-zinc-950/60">
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/8 bg-white/5 font-mono text-sm text-zinc-400">
                      #{idx + 1}
                    </div>

                    {player.avatar ? (
                      <img src={getAvatarUrl(player.avatar)} alt="" className="h-12 w-12 rounded-full object-cover ring-1 ring-white/10" />
                    ) : (
                      <div className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${avatarColors[idx % avatarColors.length]} font-display text-sm font-bold text-white ring-1 ring-white/10`}>
                        {getInitials(player.name)}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {flag ? <span className="text-base shrink-0">{flag}</span> : null}
                      {player.user_id ? (
                        <Link to={getProfilePath(player.user_id, player.name)} className="truncate font-display font-bold text-piu-accent hover:underline">
                          {player.name}
                        </Link>
                      ) : (
                        <span className="truncate font-display font-bold text-white">{player.name}</span>
                      )}
                      {genderSymbol ? (
                        <span className={`text-sm ${player.gender === 'male' ? 'text-blue-400' : 'text-pink-400'}`}>
                          {genderSymbol}
                        </span>
                      ) : null}
                      {player.skill_title ? (
                        <span className={`badge border ${getSkillColor(player.skill_title)}`}>
                          {player.skill_title}
                        </span>
                      ) : null}
                    </div>

                    {player.description ? <p className="mt-1 text-sm text-zinc-400">{player.description}</p> : null}
                  </div>

                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <div className="text-right">
                      {player.pumbility > 0 ? (
                        <div className="text-sm font-mono font-bold text-piu-gold">{Number(player.pumbility).toLocaleString()}</div>
                      ) : (
                        <div className="text-sm text-zinc-500">No pumbility</div>
                      )}
                      <div className="text-xs text-zinc-500">
                        {player.wins}W - {player.losses}L
                      </div>
                    </div>

                    {isSetup && (
                      <button
                        type="button"
                        onClick={() => handleDelete(player.id)}
                        className="rounded-full border border-white/8 bg-white/6 px-3 py-2 text-xs font-display font-bold uppercase tracking-[0.14em] text-zinc-300 transition-colors hover:border-rose-400/30 hover:text-rose-200"
                        title="Remove player"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {isSetup && players.length >= 2 && (
        <SeedingPanel players={players} tournamentId={tournamentId} onUpdate={onUpdate} />
      )}
    </div>
  );
}
