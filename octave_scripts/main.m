% Definir la función de lluvia (intensidad en mm/h), con interpolación por pasos
lluvia_fn = @(t) interp1(lluvia_puntos, intensidades, t, 'previous', 0);

% Calcular volumen sin límite para detectar desborde
t_full   = 0:dt:(total_minutes_sim + 60);
V_uncap  = zeros(size(t_full));
V_uncap(1) = V0;
for i = 2:length(t_full)
    q_in_i = lluvia_fn(t_full(i-1)) * A_cap / (60 * 1000); % Convertir mm/h a m³/min
    % fprintf('t=%f, q_in=%f, V_uncap=%f\n', t_full(i-1), q_in_i, V_uncap(i-1)); % Depuración
    dVdt_uncap = q_in_i - Q_out;
    V_uncap(i) = V_uncap(i-1) + dVdt_uncap * dt;
end

[overshoot, idx_over] = max(V_uncap);
fprintf('Max V_uncap: %f at index %d\n', overshoot, idx_over);

hay_riesgo = overshoot > V_max;
if hay_riesgo
    first_idx = find(V_uncap >= V_max, 1);
    t_desborde = t_full(first_idx);
    vaciar = overshoot - V_max;
    texto_recomendacion = sprintf('Vaciar %.2f m^3 antes de que comience la lluvia.', vaciar);
else
    t_desborde = NaN;
    vaciar = 0;
    texto_recomendacion = 'No se requieren acciones adicionales.';
end

% Calcular volumen con límite
V = zeros(size(t_full));
V(1) = V0;
for i = 2:length(t_full)
    q_in_i = lluvia_fn(t_full(i-1)) * A_cap / (60 * 1000); % Convertir mm/h a m³/min
    dVdt = q_in_i - Q_out;
    V(i) = V(i-1) + dVdt * dt;
    if V(i) > V_max
        V(i) = V_max;
    elseif V(i) < 0
        V(i) = 0;
    end
end

% Mostrar resultados
if hay_riesgo
    fprintf('⚠️ Riesgo de desborde en %.2f minutos.\n', t_desborde);
    fprintf('✅ Se recomienda vaciar %.2f m^3 antes de que inicie la lluvia.\n', vaciar);
else
    fprintf('✅ No hay riesgo de desborde.\n');
end

t = t_full;