{{/*
_helpers.tpl — helpers robustos para OpenShift/Kubernetes
- app.rawName: prioriza .Values.appName, senão .Release.Name
- app.sanitizeDns: normaliza para DNS-1123
- app.fullname: nome final de recursos
- app.label: label estável e segura (<=63)
- app.releaseLabel: label baseada no release
- app.registrySecretName: nome do secret do registry
- app.backstageKubernetesId: ID estável para Backstage
- app.serviceAccountName: nome da service account
- app.labels: labels padrão Helm/Kubernetes
- app.selectorLabels: labels para selectors
- app.livenessProbe / app.readinessProbe: compatível com schema antigo e novo
*/}}

{{/* Nome base da aplicação */}}
{{- define "app.rawName" -}}
{{- $appName := .Values.appName | default "" | toString | trim -}}
{{- if ne $appName "" -}}
{{- $appName -}}
{{- else -}}
{{- .Release.Name | toString | trim -}}
{{- end -}}
{{- end -}}

{{/* Sanitiza para DNS-1123 */}}
{{- define "app.sanitizeDns" -}}
{{- $s := printf "%s" . | lower -}}
{{- $s = regexReplaceAll "[^a-z0-9-]+" $s "-" -}}
{{- $s = regexReplaceAll "^-+" $s "" -}}
{{- $s = regexReplaceAll "-+$" $s "" -}}
{{- if gt (len $s) 63 -}}
{{- $s = trunc 63 $s -}}
{{- $s = regexReplaceAll "-+$" $s "" -}}
{{- end -}}
{{- if eq $s "" -}}
app
{{- else -}}
{{- $s -}}
{{- end -}}
{{- end -}}

{{/* Nome final da app para metadata.name */}}
{{- define "app.fullname" -}}
{{- include "app.sanitizeDns" (include "app.rawName" .) -}}
{{- end -}}

{{/* Label segura e estável */}}
{{- define "app.label" -}}
{{- $base := include "app.rawName" . | toString | trim -}}
{{- if eq $base "" -}}
{{- $base = .Release.Name | toString | trim -}}
{{- end -}}
{{- $lbl := regexReplaceAll "[^A-Za-z0-9_.-]+" $base "-" -}}
{{- $lbl = trimAll "-" $lbl -}}
{{- if gt (len $lbl) 63 -}}
{{- $lbl = trunc 63 $lbl -}}
{{- $lbl = trimAll "-" $lbl -}}
{{- end -}}
{{- if eq $lbl "" -}}
app
{{- else -}}
{{- $lbl -}}
{{- end -}}
{{- end -}}

{{/* Label baseada no nome do release */}}
{{- define "app.releaseLabel" -}}
{{- $raw := .Release.Name | toString | trim -}}
{{- $lbl := regexReplaceAll "[^A-Za-z0-9_.-]+" $raw "-" -}}
{{- $lbl = trimAll "-" $lbl -}}
{{- if gt (len $lbl) 63 -}}
{{- $lbl = trunc 63 $lbl -}}
{{- $lbl = trimAll "-" $lbl -}}
{{- end -}}
{{- if eq $lbl "" -}}
release
{{- else -}}
{{- $lbl -}}
{{- end -}}
{{- end -}}

{{/* Labels usadas em selectors */}}
{{- define "app.selectorLabels" -}}
app.kubernetes.io/name: {{ include "app.label" . | quote }}
app.kubernetes.io/instance: {{ .Release.Name | quote }}
{{- end -}}

{{/* Labels padrão Helm/Kubernetes */}}
{{- define "app.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name (.Chart.Version | replace "+" "_") | quote }}
app.kubernetes.io/name: {{ include "app.label" . | quote }}
app.kubernetes.io/instance: {{ .Release.Name | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service | quote }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
{{- end -}}

{{/* Nome do secret docker registry */}}
{{- define "app.registrySecretName" -}}
{{- $registrySecret := .Values.registrySecret | default dict -}}
{{- $n := ($registrySecret.name | default "") | toString | trim -}}
{{- if eq $n "" -}}
{{- $n = printf "secret-%s-registry" (include "app.fullname" .) -}}
{{- end -}}
{{- include "app.sanitizeDns" $n -}}
{{- end -}}

{{/* Nome da service account */}}
{{- define "app.serviceAccountName" -}}
{{- $serviceAccount := .Values.serviceAccount | default dict -}}
{{- $create := ($serviceAccount.create | default true) -}}
{{- $name := ($serviceAccount.name | default "") | toString | trim -}}
{{- if $create -}}
{{- if ne $name "" -}}
{{- include "app.sanitizeDns" $name -}}
{{- else -}}
{{- include "app.fullname" . -}}
{{- end -}}
{{- else -}}
{{- if ne $name "" -}}
{{- include "app.sanitizeDns" $name -}}
{{- else -}}
default
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Backstage kubernetes-id seguro */}}
{{- define "app.backstageKubernetesId" -}}
{{- $backstage := .Values.backstage | default dict -}}
{{- default (include "app.label" .) $backstage.kubernetesId | quote -}}
{{- end -}}

{{/* Compatibilidade: helper antigo de livenessProbe */}}
{{- define "app.livenessProbe" -}}
{{- $probes := .Values.probes | default dict -}}
{{- $liveness := $probes.liveness | default dict -}}
{{- if and ($liveness.enabled | default false) (gt (len $liveness) 0) -}}
{{- toYaml (omit $liveness "enabled") -}}
{{- else if .Values.livenessProbe -}}
{{- toYaml .Values.livenessProbe -}}
{{- else -}}
httpGet:
  path: /healthz
  port: 8080
initialDelaySeconds: 10
periodSeconds: 10
failureThreshold: 3
{{- end -}}
{{- end -}}

{{/* Compatibilidade: helper antigo de readinessProbe */}}
{{- define "app.readinessProbe" -}}
{{- $probes := .Values.probes | default dict -}}
{{- $readiness := $probes.readiness | default dict -}}
{{- if and ($readiness.enabled | default false) (gt (len $readiness) 0) -}}
{{- toYaml (omit $readiness "enabled") -}}
{{- else if .Values.readinessProbe -}}
{{- toYaml .Values.readinessProbe -}}
{{- else -}}
httpGet:
  path: /healthz
  port: 8080
initialDelaySeconds: 5
periodSeconds: 5
failureThreshold: 3
{{- end -}}
{{- end -}}
