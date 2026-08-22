import type { ServiceCategory, ServiceSpecificationType } from '../services/serviceApi';
import type { ServiceSpecFormState } from '../utils/serviceSpecificationForm';
import Field from './Field';

/**
 * Campos de ServiceSpecification (Camada, Categoria, Descrição) — compartilhado pelo modal
 * embutido em ServicePage (onde a categoria vem da página ativa, exibida só como leitura) e pelo
 * editor de catálogo em Configurações (onde `categoryOptions` habilita a escolha). O campo Nome é
 * renderizado por quem usa este componente, pois em ServicePage ele já é compartilhado com o
 * formulário de instância (CFS/RFS) — aqui evitamos duplicar esse input.
 */
export default function ServiceSpecificationFields({
  formState,
  onChange,
  categoryOptions,
}: {
  formState: ServiceSpecFormState;
  onChange: (next: ServiceSpecFormState) => void;
  /** Quando presente, renderiza um select de Categoria (Configurações não tem categoria de página). */
  categoryOptions?: ServiceCategory[];
}) {
  return (
    <>
      <Field label="Camada">
        <select
          className="geo-input"
          value={formState.serviceType}
          onChange={(event) =>
            onChange({ ...formState, serviceType: event.target.value as ServiceSpecificationType })
          }
        >
          <option value="CFS">CFS — serviço de cliente</option>
          <option value="RFS">RFS — serviço de rede</option>
        </select>
      </Field>
      <Field label="Categoria">
        {categoryOptions ? (
          <select
            className="geo-input"
            value={formState.category}
            onChange={(event) => onChange({ ...formState, category: event.target.value })}
          >
            <option value="">Selecione uma categoria</option>
            {categoryOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
        ) : (
          <input className="geo-input" value={formState.category} readOnly />
        )}
      </Field>
      <Field label="Descrição" fullWidth>
        <textarea
          className="geo-input"
          rows={3}
          value={formState.description}
          onChange={(event) => onChange({ ...formState, description: event.target.value })}
        />
      </Field>
    </>
  );
}
