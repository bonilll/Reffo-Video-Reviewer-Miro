import React from 'react';
import { LegalDoc } from './LegalDoc';
import { TERMS_OF_USE } from '../../legal/legalContent';

const TermsOfUse: React.FC = () => (
  <LegalDoc doc={TERMS_OF_USE} />
);

export default TermsOfUse;
