"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateAtendimentoDto = exports.MenorDataDto = exports.ClienteDataDto = void 0;
var class_validator_1 = require("class-validator");
var class_transformer_1 = require("class-transformer");
var ClienteDataDto = function () {
    var _a;
    var _nome_decorators;
    var _nome_initializers = [];
    var _nome_extraInitializers = [];
    var _cpf_decorators;
    var _cpf_initializers = [];
    var _cpf_extraInitializers = [];
    var _rg_decorators;
    var _rg_initializers = [];
    var _rg_extraInitializers = [];
    var _dataNascimento_decorators;
    var _dataNascimento_initializers = [];
    var _dataNascimento_extraInitializers = [];
    var _telefone_decorators;
    var _telefone_initializers = [];
    var _telefone_extraInitializers = [];
    var _email_decorators;
    var _email_initializers = [];
    var _email_extraInitializers = [];
    var _endereco_decorators;
    var _endereco_initializers = [];
    var _endereco_extraInitializers = [];
    return _a = /** @class */ (function () {
            function ClienteDataDto() {
                this.nome = __runInitializers(this, _nome_initializers, void 0);
                this.cpf = (__runInitializers(this, _nome_extraInitializers), __runInitializers(this, _cpf_initializers, void 0));
                this.rg = (__runInitializers(this, _cpf_extraInitializers), __runInitializers(this, _rg_initializers, void 0));
                this.dataNascimento = (__runInitializers(this, _rg_extraInitializers), __runInitializers(this, _dataNascimento_initializers, void 0));
                this.telefone = (__runInitializers(this, _dataNascimento_extraInitializers), __runInitializers(this, _telefone_initializers, void 0));
                this.email = (__runInitializers(this, _telefone_extraInitializers), __runInitializers(this, _email_initializers, void 0));
                this.endereco = (__runInitializers(this, _email_extraInitializers), __runInitializers(this, _endereco_initializers, void 0));
                __runInitializers(this, _endereco_extraInitializers);
            }
            return ClienteDataDto;
        }()),
        (function () {
            var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _nome_decorators = [(0, class_validator_1.IsString)()];
            _cpf_decorators = [(0, class_validator_1.IsString)()];
            _rg_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _dataNascimento_decorators = [(0, class_validator_1.IsString)()];
            _telefone_decorators = [(0, class_validator_1.IsString)()];
            _email_decorators = [(0, class_validator_1.IsEmail)()];
            _endereco_decorators = [(0, class_validator_1.IsObject)()];
            __esDecorate(null, null, _nome_decorators, { kind: "field", name: "nome", static: false, private: false, access: { has: function (obj) { return "nome" in obj; }, get: function (obj) { return obj.nome; }, set: function (obj, value) { obj.nome = value; } }, metadata: _metadata }, _nome_initializers, _nome_extraInitializers);
            __esDecorate(null, null, _cpf_decorators, { kind: "field", name: "cpf", static: false, private: false, access: { has: function (obj) { return "cpf" in obj; }, get: function (obj) { return obj.cpf; }, set: function (obj, value) { obj.cpf = value; } }, metadata: _metadata }, _cpf_initializers, _cpf_extraInitializers);
            __esDecorate(null, null, _rg_decorators, { kind: "field", name: "rg", static: false, private: false, access: { has: function (obj) { return "rg" in obj; }, get: function (obj) { return obj.rg; }, set: function (obj, value) { obj.rg = value; } }, metadata: _metadata }, _rg_initializers, _rg_extraInitializers);
            __esDecorate(null, null, _dataNascimento_decorators, { kind: "field", name: "dataNascimento", static: false, private: false, access: { has: function (obj) { return "dataNascimento" in obj; }, get: function (obj) { return obj.dataNascimento; }, set: function (obj, value) { obj.dataNascimento = value; } }, metadata: _metadata }, _dataNascimento_initializers, _dataNascimento_extraInitializers);
            __esDecorate(null, null, _telefone_decorators, { kind: "field", name: "telefone", static: false, private: false, access: { has: function (obj) { return "telefone" in obj; }, get: function (obj) { return obj.telefone; }, set: function (obj, value) { obj.telefone = value; } }, metadata: _metadata }, _telefone_initializers, _telefone_extraInitializers);
            __esDecorate(null, null, _email_decorators, { kind: "field", name: "email", static: false, private: false, access: { has: function (obj) { return "email" in obj; }, get: function (obj) { return obj.email; }, set: function (obj, value) { obj.email = value; } }, metadata: _metadata }, _email_initializers, _email_extraInitializers);
            __esDecorate(null, null, _endereco_decorators, { kind: "field", name: "endereco", static: false, private: false, access: { has: function (obj) { return "endereco" in obj; }, get: function (obj) { return obj.endereco; }, set: function (obj, value) { obj.endereco = value; } }, metadata: _metadata }, _endereco_initializers, _endereco_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
}();
exports.ClienteDataDto = ClienteDataDto;
var MenorDataDto = function () {
    var _a;
    var _nome_decorators;
    var _nome_initializers = [];
    var _nome_extraInitializers = [];
    var _dataNascimento_decorators;
    var _dataNascimento_initializers = [];
    var _dataNascimento_extraInitializers = [];
    var _cpf_decorators;
    var _cpf_initializers = [];
    var _cpf_extraInitializers = [];
    var _rg_decorators;
    var _rg_initializers = [];
    var _rg_extraInitializers = [];
    var _tipoResponsavel_decorators;
    var _tipoResponsavel_initializers = [];
    var _tipoResponsavel_extraInitializers = [];
    return _a = /** @class */ (function () {
            function MenorDataDto() {
                this.nome = __runInitializers(this, _nome_initializers, void 0);
                this.dataNascimento = (__runInitializers(this, _nome_extraInitializers), __runInitializers(this, _dataNascimento_initializers, void 0));
                this.cpf = (__runInitializers(this, _dataNascimento_extraInitializers), __runInitializers(this, _cpf_initializers, void 0));
                this.rg = (__runInitializers(this, _cpf_extraInitializers), __runInitializers(this, _rg_initializers, void 0));
                this.tipoResponsavel = (__runInitializers(this, _rg_extraInitializers), __runInitializers(this, _tipoResponsavel_initializers, void 0)); // pai, mae, tutor
                __runInitializers(this, _tipoResponsavel_extraInitializers);
            }
            return MenorDataDto;
        }()),
        (function () {
            var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _nome_decorators = [(0, class_validator_1.IsString)()];
            _dataNascimento_decorators = [(0, class_validator_1.IsString)()];
            _cpf_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _rg_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _tipoResponsavel_decorators = [(0, class_validator_1.IsString)()];
            __esDecorate(null, null, _nome_decorators, { kind: "field", name: "nome", static: false, private: false, access: { has: function (obj) { return "nome" in obj; }, get: function (obj) { return obj.nome; }, set: function (obj, value) { obj.nome = value; } }, metadata: _metadata }, _nome_initializers, _nome_extraInitializers);
            __esDecorate(null, null, _dataNascimento_decorators, { kind: "field", name: "dataNascimento", static: false, private: false, access: { has: function (obj) { return "dataNascimento" in obj; }, get: function (obj) { return obj.dataNascimento; }, set: function (obj, value) { obj.dataNascimento = value; } }, metadata: _metadata }, _dataNascimento_initializers, _dataNascimento_extraInitializers);
            __esDecorate(null, null, _cpf_decorators, { kind: "field", name: "cpf", static: false, private: false, access: { has: function (obj) { return "cpf" in obj; }, get: function (obj) { return obj.cpf; }, set: function (obj, value) { obj.cpf = value; } }, metadata: _metadata }, _cpf_initializers, _cpf_extraInitializers);
            __esDecorate(null, null, _rg_decorators, { kind: "field", name: "rg", static: false, private: false, access: { has: function (obj) { return "rg" in obj; }, get: function (obj) { return obj.rg; }, set: function (obj, value) { obj.rg = value; } }, metadata: _metadata }, _rg_initializers, _rg_extraInitializers);
            __esDecorate(null, null, _tipoResponsavel_decorators, { kind: "field", name: "tipoResponsavel", static: false, private: false, access: { has: function (obj) { return "tipoResponsavel" in obj; }, get: function (obj) { return obj.tipoResponsavel; }, set: function (obj, value) { obj.tipoResponsavel = value; } }, metadata: _metadata }, _tipoResponsavel_initializers, _tipoResponsavel_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
}();
exports.MenorDataDto = MenorDataDto;
var CreateAtendimentoDto = function () {
    var _a;
    var _cliente_decorators;
    var _cliente_initializers = [];
    var _cliente_extraInitializers = [];
    var _menor_decorators;
    var _menor_initializers = [];
    var _menor_extraInitializers = [];
    var _tipoRepresentacao_decorators;
    var _tipoRepresentacao_initializers = [];
    var _tipoRepresentacao_extraInitializers = [];
    var _area_decorators;
    var _area_initializers = [];
    var _area_extraInitializers = [];
    var _tipoAcao_decorators;
    var _tipoAcao_initializers = [];
    var _tipoAcao_extraInitializers = [];
    var _valorAcao_decorators;
    var _valorAcao_initializers = [];
    var _valorAcao_extraInitializers = [];
    var _tipoHonorario_decorators;
    var _tipoHonorario_initializers = [];
    var _tipoHonorario_extraInitializers = [];
    var _valorFixo_decorators;
    var _valorFixo_initializers = [];
    var _valorFixo_extraInitializers = [];
    var _percentualExito_decorators;
    var _percentualExito_initializers = [];
    var _percentualExito_extraInitializers = [];
    var _formaPagamento_decorators;
    var _formaPagamento_initializers = [];
    var _formaPagamento_extraInitializers = [];
    var _parcelamento_decorators;
    var _parcelamento_initializers = [];
    var _parcelamento_extraInitializers = [];
    var _numParcelas_decorators;
    var _numParcelas_initializers = [];
    var _numParcelas_extraInitializers = [];
    var _vencimento1Parc_decorators;
    var _vencimento1Parc_initializers = [];
    var _vencimento1Parc_extraInitializers = [];
    var _questionario_decorators;
    var _questionario_initializers = [];
    var _questionario_extraInitializers = [];
    var _mensagem_decorators;
    var _mensagem_initializers = [];
    var _mensagem_extraInitializers = [];
    return _a = /** @class */ (function () {
            function CreateAtendimentoDto() {
                this.cliente = __runInitializers(this, _cliente_initializers, void 0);
                this.menor = (__runInitializers(this, _cliente_extraInitializers), __runInitializers(this, _menor_initializers, void 0));
                this.tipoRepresentacao = (__runInitializers(this, _menor_extraInitializers), __runInitializers(this, _tipoRepresentacao_initializers, void 0)); // proprio, menor
                // Case data
                this.area = (__runInitializers(this, _tipoRepresentacao_extraInitializers), __runInitializers(this, _area_initializers, void 0)); // Trabalhista, Empresarial, Família, etc
                this.tipoAcao = (__runInitializers(this, _area_extraInitializers), __runInitializers(this, _tipoAcao_initializers, void 0));
                this.valorAcao = (__runInitializers(this, _tipoAcao_extraInitializers), __runInitializers(this, _valorAcao_initializers, void 0));
                // Financial data
                this.tipoHonorario = (__runInitializers(this, _valorAcao_extraInitializers), __runInitializers(this, _tipoHonorario_initializers, void 0)); // fixo, percentual, fixo_sucesso
                this.valorFixo = (__runInitializers(this, _tipoHonorario_extraInitializers), __runInitializers(this, _valorFixo_initializers, void 0));
                this.percentualExito = (__runInitializers(this, _valorFixo_extraInitializers), __runInitializers(this, _percentualExito_initializers, void 0));
                this.formaPagamento = (__runInitializers(this, _percentualExito_extraInitializers), __runInitializers(this, _formaPagamento_initializers, void 0));
                this.parcelamento = (__runInitializers(this, _formaPagamento_extraInitializers), __runInitializers(this, _parcelamento_initializers, void 0));
                this.numParcelas = (__runInitializers(this, _parcelamento_extraInitializers), __runInitializers(this, _numParcelas_initializers, void 0));
                this.vencimento1Parc = (__runInitializers(this, _numParcelas_extraInitializers), __runInitializers(this, _vencimento1Parc_initializers, void 0)); // ISO date
                // Questionnaire
                this.questionario = (__runInitializers(this, _vencimento1Parc_extraInitializers), __runInitializers(this, _questionario_initializers, void 0));
                // Document envelope
                this.mensagem = (__runInitializers(this, _questionario_extraInitializers), __runInitializers(this, _mensagem_initializers, void 0));
                __runInitializers(this, _mensagem_extraInitializers);
            }
            return CreateAtendimentoDto;
        }()),
        (function () {
            var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _cliente_decorators = [(0, class_validator_1.ValidateNested)(), (0, class_transformer_1.Type)(function () { return ClienteDataDto; })];
            _menor_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.ValidateNested)(), (0, class_transformer_1.Type)(function () { return MenorDataDto; })];
            _tipoRepresentacao_decorators = [(0, class_validator_1.IsString)()];
            _area_decorators = [(0, class_validator_1.IsString)()];
            _tipoAcao_decorators = [(0, class_validator_1.IsString)()];
            _valorAcao_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumber)()];
            _tipoHonorario_decorators = [(0, class_validator_1.IsString)()];
            _valorFixo_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumber)()];
            _percentualExito_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumber)()];
            _formaPagamento_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _parcelamento_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsBoolean)()];
            _numParcelas_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumber)()];
            _vencimento1Parc_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _questionario_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsObject)()];
            _mensagem_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            __esDecorate(null, null, _cliente_decorators, { kind: "field", name: "cliente", static: false, private: false, access: { has: function (obj) { return "cliente" in obj; }, get: function (obj) { return obj.cliente; }, set: function (obj, value) { obj.cliente = value; } }, metadata: _metadata }, _cliente_initializers, _cliente_extraInitializers);
            __esDecorate(null, null, _menor_decorators, { kind: "field", name: "menor", static: false, private: false, access: { has: function (obj) { return "menor" in obj; }, get: function (obj) { return obj.menor; }, set: function (obj, value) { obj.menor = value; } }, metadata: _metadata }, _menor_initializers, _menor_extraInitializers);
            __esDecorate(null, null, _tipoRepresentacao_decorators, { kind: "field", name: "tipoRepresentacao", static: false, private: false, access: { has: function (obj) { return "tipoRepresentacao" in obj; }, get: function (obj) { return obj.tipoRepresentacao; }, set: function (obj, value) { obj.tipoRepresentacao = value; } }, metadata: _metadata }, _tipoRepresentacao_initializers, _tipoRepresentacao_extraInitializers);
            __esDecorate(null, null, _area_decorators, { kind: "field", name: "area", static: false, private: false, access: { has: function (obj) { return "area" in obj; }, get: function (obj) { return obj.area; }, set: function (obj, value) { obj.area = value; } }, metadata: _metadata }, _area_initializers, _area_extraInitializers);
            __esDecorate(null, null, _tipoAcao_decorators, { kind: "field", name: "tipoAcao", static: false, private: false, access: { has: function (obj) { return "tipoAcao" in obj; }, get: function (obj) { return obj.tipoAcao; }, set: function (obj, value) { obj.tipoAcao = value; } }, metadata: _metadata }, _tipoAcao_initializers, _tipoAcao_extraInitializers);
            __esDecorate(null, null, _valorAcao_decorators, { kind: "field", name: "valorAcao", static: false, private: false, access: { has: function (obj) { return "valorAcao" in obj; }, get: function (obj) { return obj.valorAcao; }, set: function (obj, value) { obj.valorAcao = value; } }, metadata: _metadata }, _valorAcao_initializers, _valorAcao_extraInitializers);
            __esDecorate(null, null, _tipoHonorario_decorators, { kind: "field", name: "tipoHonorario", static: false, private: false, access: { has: function (obj) { return "tipoHonorario" in obj; }, get: function (obj) { return obj.tipoHonorario; }, set: function (obj, value) { obj.tipoHonorario = value; } }, metadata: _metadata }, _tipoHonorario_initializers, _tipoHonorario_extraInitializers);
            __esDecorate(null, null, _valorFixo_decorators, { kind: "field", name: "valorFixo", static: false, private: false, access: { has: function (obj) { return "valorFixo" in obj; }, get: function (obj) { return obj.valorFixo; }, set: function (obj, value) { obj.valorFixo = value; } }, metadata: _metadata }, _valorFixo_initializers, _valorFixo_extraInitializers);
            __esDecorate(null, null, _percentualExito_decorators, { kind: "field", name: "percentualExito", static: false, private: false, access: { has: function (obj) { return "percentualExito" in obj; }, get: function (obj) { return obj.percentualExito; }, set: function (obj, value) { obj.percentualExito = value; } }, metadata: _metadata }, _percentualExito_initializers, _percentualExito_extraInitializers);
            __esDecorate(null, null, _formaPagamento_decorators, { kind: "field", name: "formaPagamento", static: false, private: false, access: { has: function (obj) { return "formaPagamento" in obj; }, get: function (obj) { return obj.formaPagamento; }, set: function (obj, value) { obj.formaPagamento = value; } }, metadata: _metadata }, _formaPagamento_initializers, _formaPagamento_extraInitializers);
            __esDecorate(null, null, _parcelamento_decorators, { kind: "field", name: "parcelamento", static: false, private: false, access: { has: function (obj) { return "parcelamento" in obj; }, get: function (obj) { return obj.parcelamento; }, set: function (obj, value) { obj.parcelamento = value; } }, metadata: _metadata }, _parcelamento_initializers, _parcelamento_extraInitializers);
            __esDecorate(null, null, _numParcelas_decorators, { kind: "field", name: "numParcelas", static: false, private: false, access: { has: function (obj) { return "numParcelas" in obj; }, get: function (obj) { return obj.numParcelas; }, set: function (obj, value) { obj.numParcelas = value; } }, metadata: _metadata }, _numParcelas_initializers, _numParcelas_extraInitializers);
            __esDecorate(null, null, _vencimento1Parc_decorators, { kind: "field", name: "vencimento1Parc", static: false, private: false, access: { has: function (obj) { return "vencimento1Parc" in obj; }, get: function (obj) { return obj.vencimento1Parc; }, set: function (obj, value) { obj.vencimento1Parc = value; } }, metadata: _metadata }, _vencimento1Parc_initializers, _vencimento1Parc_extraInitializers);
            __esDecorate(null, null, _questionario_decorators, { kind: "field", name: "questionario", static: false, private: false, access: { has: function (obj) { return "questionario" in obj; }, get: function (obj) { return obj.questionario; }, set: function (obj, value) { obj.questionario = value; } }, metadata: _metadata }, _questionario_initializers, _questionario_extraInitializers);
            __esDecorate(null, null, _mensagem_decorators, { kind: "field", name: "mensagem", static: false, private: false, access: { has: function (obj) { return "mensagem" in obj; }, get: function (obj) { return obj.mensagem; }, set: function (obj, value) { obj.mensagem = value; } }, metadata: _metadata }, _mensagem_initializers, _mensagem_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
}();
exports.CreateAtendimentoDto = CreateAtendimentoDto;
