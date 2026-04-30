/**
 * Seed data — Groupe Moreau Automobiles (Lyon)
 * Used by the API seed script and the frontend demo mode.
 */

import type { User, Company, Vehicle, Lead } from '@autocrm/shared-types'
import { generateId } from './index'

// ─── Company ─────────────────────────────────────────────────────────────────

export const SEED_COMPANY: Company = {
  id: 'company_01',
  name: 'Groupe Moreau Automobiles',
  plan: 'pro',
  address: '47 Avenue Jean Jaurès, 69007 Lyon',
  phone: '04 72 33 45 67',
  email: 'contact@moreau-auto.fr',
  featureFlags: { automation: true, sms: true, advancedReports: true },
  createdAt: '2023-01-15T09:00:00.000Z',
}

// ─── Users ───────────────────────────────────────────────────────────────────

export const SEED_USERS: User[] = [
  {
    id: 'u1', companyId: 'company_01',
    name: 'Marc Moreau', email: 'marc@moreau-auto.fr',
    role: 'admin', avatar: 'MM', phone: '06 12 34 56 78',
    active: true, createdAt: '2023-01-15T09:00:00.000Z',
  },
  {
    id: 'u2', companyId: 'company_01',
    name: 'Sophie Leblanc', email: 'sophie@moreau-auto.fr',
    role: 'manager', avatar: 'SL', phone: '06 23 45 67 89',
    active: true, createdAt: '2023-01-16T09:00:00.000Z',
  },
  {
    id: 'u3', companyId: 'company_01',
    name: 'Antoine Dupont', email: 'antoine@moreau-auto.fr',
    role: 'salesperson', avatar: 'AD', phone: '06 34 56 78 90',
    active: true, createdAt: '2023-02-01T09:00:00.000Z',
  },
  {
    id: 'u4', companyId: 'company_01',
    name: 'Camille Bernard', email: 'camille@moreau-auto.fr',
    role: 'salesperson', avatar: 'CB', phone: '06 45 67 89 01',
    active: true, createdAt: '2023-02-15T09:00:00.000Z',
  },
]

// ─── Vehicles ────────────────────────────────────────────────────────────────

const VEHICLE_DEFS = [
  { make: 'Peugeot',    model: '3008',          fuel: 'Diesel',     price: 24900, mileage: 42000, year: 2021, color: 'Gris Artense',     features: ['GPS', 'Caméra recul', 'Toit pano'] },
  { make: 'Renault',    model: 'Clio V',         fuel: 'Essence',    price: 16500, mileage: 18000, year: 2022, color: 'Rouge Flamme',     features: ['Carplay', 'Radars'] },
  { make: 'Volkswagen', model: 'Golf 8',         fuel: 'Essence',    price: 22800, mileage: 35000, year: 2021, color: 'Blanc Pur',        features: ['DSG', 'LED', 'Lane Assist'] },
  { make: 'Citroën',   model: 'C5 Aircross',    fuel: 'Diesel',     price: 19900, mileage: 58000, year: 2020, color: 'Bleu Emeraude',    features: ['Toit pano', 'Massage'] },
  { make: 'Toyota',    model: 'Yaris Hybrid',   fuel: 'Hybride',    price: 18700, mileage: 12000, year: 2022, color: 'Noir Minuit',      features: ['Hybride', 'Safety Sense'] },
  { make: 'BMW',       model: 'Série 3',        fuel: 'Diesel',     price: 31900, mileage: 48000, year: 2020, color: 'Bleu Métallisé',  features: ['Pack M', 'HUD', 'Harman Kardon'] },
  { make: 'Mercedes',  model: 'Classe A',       fuel: 'Essence',    price: 28500, mileage: 31000, year: 2021, color: 'Gris Montagne',   features: ['MBUX', 'Toit pano', 'AMG Line'] },
  { make: 'Audi',      model: 'A3 Sportback',   fuel: 'Essence',    price: 29900, mileage: 22000, year: 2022, color: 'Rouge Tango',     features: ['Virtual Cockpit', 'S Line'] },
  { make: 'Ford',      model: 'Mustang Mach-E', fuel: 'Électrique', price: 39900, mileage: 9000,  year: 2022, color: 'Blanc Star',       features: ['Autopilot', 'Charge rapide'] },
  { make: 'Skoda',     model: 'Octavia',        fuel: 'Diesel',     price: 18900, mileage: 41000, year: 2021, color: 'Gris Quartz',     features: ['Canton Audio', 'ACC'] },
  { make: 'Hyundai',   model: 'Tucson',         fuel: 'Hybride',    price: 27800, mileage: 14000, year: 2022, color: 'Bleu Saphir',     features: ['Toit pano', 'BOSE'] },
  { make: 'Kia',       model: 'Sportage',       fuel: 'Hybride',    price: 26500, mileage: 19000, year: 2022, color: 'Vert Forêt',     features: ['360°', 'Meridian Audio'] },
  { make: 'Nissan',    model: 'Leaf',           fuel: 'Électrique', price: 22900, mileage: 28000, year: 2021, color: 'Blanc Pearl',      features: ['Charge rapide', 'ProPilot'] },
  { make: 'Peugeot',   model: '508 SW',         fuel: 'Diesel',     price: 23400, mileage: 67000, year: 2020, color: 'Gris Platinium',  features: ['Toit pano', 'Massage', 'HiLi'] },
  { make: 'Renault',   model: 'Megane E-Tech',  fuel: 'Électrique', price: 34900, mileage: 4000,  year: 2023, color: 'Bleu Iron',       features: ['Charge 130kW', 'Google intégré'] },
  { make: 'Dacia',     model: 'Duster',         fuel: 'GPL',        price: 14900, mileage: 38000, year: 2021, color: 'Vert Khaki',      features: ['4x4', 'Carplay'] },
  { make: 'Opel',      model: 'Grandland',      fuel: 'Hybride',    price: 25900, mileage: 16000, year: 2022, color: 'Blanc Cristal',   features: ['Toit pano', 'Matrix LED'] },
  { make: 'Volvo',     model: 'XC40',           fuel: 'Essence',    price: 33500, mileage: 29000, year: 2021, color: 'Gris Osmium',     features: ['Harman Kardon', 'Pilot Assist'] },
  { make: 'Tesla',     model: 'Model 3',        fuel: 'Électrique', price: 42900, mileage: 11000, year: 2022, color: 'Rouge Multi-Coat', features: ['Autopilot', 'Supercharger'] },
  { make: 'Fiat',      model: '500e',           fuel: 'Électrique', price: 19900, mileage: 7000,  year: 2022, color: 'Rose Passione',   features: ['Toit ouvrant', '42kWh'] },
]

const STATUSES: Vehicle['status'][] = ['Disponible', 'Disponible', 'Disponible', 'Réservé', 'Vendu', 'Archivé']

export const SEED_VEHICLES: Vehicle[] = VEHICLE_DEFS.map((def, i) => {
  const status = STATUSES[i % STATUSES.length]
  return {
    id: `v${i + 1}`,
    companyId: 'company_01',
    ...def,
    fuel: def.fuel as Vehicle['fuel'],
    vin: `VF${Math.random().toString(36).toUpperCase().slice(0, 14)}`,
    status,
    photos: [],
    statusHistory: [],
    reservedBy: status === 'Réservé' ? SEED_USERS[(i % 3) + 1].id : null,
    reservedAt: status === 'Réservé' ? new Date(Date.now() - 86400000 * ((i % 5) + 1)).toISOString() : null,
    soldBy: status === 'Vendu' ? SEED_USERS[(i % 2) + 1].id : null,
    soldAt: status === 'Vendu' ? new Date(Date.now() - 86400000 * ((i % 10) + 3)).toISOString() : null,
    createdAt: new Date(Date.now() - 86400000 * (90 - i * 4)).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * (30 - i)).toISOString(),
  }
})

// ─── Leads ───────────────────────────────────────────────────────────────────

const FIRST_NAMES = ['Jean','Marie','Pierre','Sophie','Laurent','Isabelle','François','Claire','Michel','Anne','David','Nathalie','Thomas','Valérie','Nicolas','Céline','Julien','Sandrine','Alexandre','Émilie','Christophe','Patricia','Philippe','Caroline','Sébastien','Véronique','Romain','Sylvie','Mathieu','Hélène']
const LAST_NAMES  = ['Martin','Bernard','Dubois','Thomas','Robert','Petit','Durand','Leroy','Moreau','Simon','Laurent','Lefebvre','Michel','Garcia','David','Bertrand','Roux','Vincent','Fournier','Morel','Girard','André','Mercier','Dupont','Lambert','Bonnet','François','Martinez','Legrand','Garnier']
const NOTES_POOL  = ['Client très intéressé, budget flexible.','Cherche véhicule hybride pour trajets quotidiens.','Déjà venu en concession, essai prévu vendredi.','En attente de rappel client.','Recherche financement sur 60 mois.','Ancien client fidèle depuis 5 ans.','Compare avec une autre concession.','Besoin urgent, véhicule actuel en panne.','Cherche break pour la famille.','Préfère diesel pour longs trajets professionnels.']
const SOURCES: Lead['source'][] = ['Site web','Leboncoin','AutoScout24','LaVieAuto','Téléphone','Passage','Référence','Facebook','Google Ads','ParuVendu']
const STAGES: Lead['stage'][]   = ['Nouveau','Contacté','Qualifié','Essai','Négociation','Gagné','Perdu']
const SALESPERSON_IDS = ['u2','u3','u4']

export const SEED_LEADS: Lead[] = Array.from({ length: 50 }, (_, i) => {
  const fn = FIRST_NAMES[i % FIRST_NAMES.length]
  const ln = LAST_NAMES[(i * 3) % LAST_NAMES.length]
  const stageIdx  = i % STAGES.length
  const assignedTo = SALESPERSON_IDS[i % SALESPERSON_IDS.length]
  const daysAgo   = Math.round(i * 1.2) % 60

  return {
    id: `lead_${i + 1}`,
    companyId: 'company_01',
    firstName: fn,
    lastName: ln,
    email: `${fn.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}${i}@example.fr`,
    phone: `06 ${String(30 + (i % 60)).padStart(2, '0')} ${String(10 + (i % 80)).padStart(2, '0')} ${String(20 + (i % 70)).padStart(2, '0')} ${String(10 + (i % 80)).padStart(2, '0')}`,
    stage: STAGES[stageIdx],
    source: SOURCES[i % SOURCES.length],
    assignedTo,
    createdBy: assignedTo,
    vehicleInterest: `v${(i % 10) + 1}`,
    budget: (10 + (i % 30)) * 1000,
    notes: NOTES_POOL[i % NOTES_POOL.length],
    tags: i % 5 === 0 ? ['Premium'] : i % 7 === 0 ? ['Urgent'] : [],
    activities: [],
    slaHours: 24,
    slaBreached: daysAgo > 3 && stageIdx < 2,
    lastContact: null,
    createdAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - Math.floor(daysAgo * 0.5) * 86400000).toISOString(),
  }
})
