import { Thermometer } from '../../icons';
import GenericClimateCard from './GenericClimateCard';

export default function ThermostatCard(props) {
  return <GenericClimateCard {...props} defaultIcon={Thermometer} />;
}
