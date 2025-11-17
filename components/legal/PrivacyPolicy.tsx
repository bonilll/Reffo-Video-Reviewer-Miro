import React from 'react';
import { LegalDoc } from './LegalDoc';
import { PRIVACY_POLICY } from '../../legal/legalContent';

const PrivacyPolicy: React.FC = () => (
  <LegalDoc doc={PRIVACY_POLICY} note="This draft must be reviewed and customised by legal counsel before publication." />
);

export default PrivacyPolicy;
