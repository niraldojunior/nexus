const NEXUS_TERM_DICTIONARY = {
  GeographicLocation: 'Localização',
  GeographicAddress: 'Endereço',
  GeographicSite: 'Site',
  GeographicSiteSpecification: 'Tipo de Site',
};

const NEXUS_TERM_FALLBACKS = {
  Location: 'Localização',
  Address: 'Endereço',
  Site: 'Site',
  'Site Spec': 'Tipo de Site',
  'Site Specification': 'Tipo de Site',
  Locations: 'Localizações',
  Addresses: 'Endereços',
  Sites: 'Sites',
  Specs: 'Tipos de Site',
};

function translateTerm(term) {
  if (!term) return term;
  return NEXUS_TERM_DICTIONARY[term] || NEXUS_TERM_FALLBACKS[term] || term;
}

function translateLabel(label) {
  return translateTerm(label);
}

window.NEXUS_TERMS = {
  dictionary: NEXUS_TERM_DICTIONARY,
  translateTerm,
  translateLabel,
};
