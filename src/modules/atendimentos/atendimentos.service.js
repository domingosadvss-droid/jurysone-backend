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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AtendimentosService = void 0;
var common_1 = require("@nestjs/common");
var AtendimentosService = function () {
    var _classDecorators = [(0, common_1.Injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var AtendimentosService = _classThis = /** @class */ (function () {
        function AtendimentosService_1(prisma) {
            this.prisma = prisma;
        }
        /**
         * Create a complete atendimento with all related records
         * This is atomic - creates: client, case, financial record, documents, esign envelope
         */
        AtendimentosService_1.prototype.createCompleteAtendimento = function (escritorioId, dto) {
            return __awaiter(this, void 0, void 0, function () {
                var cliente_1, menorId, menor, processo_1, lancamento, documentTypes, docs, dataLimite, envelope, atendimento, error_1;
                var _this = this;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 11, , 12]);
                            return [4 /*yield*/, this.prisma.cliente.upsert({
                                    where: { cpf: dto.cliente.cpf },
                                    update: {},
                                    create: {
                                        nome: dto.cliente.nome,
                                        cpf: dto.cliente.cpf,
                                        rg: dto.cliente.rg,
                                        dataNascimento: new Date(dto.cliente.dataNascimento),
                                        telefone: dto.cliente.telefone,
                                        email: dto.cliente.email,
                                        endereco: typeof dto.cliente.endereco === 'string' ? dto.cliente.endereco : JSON.stringify(dto.cliente.endereco),
                                        escritorioId: escritorioId,
                                    },
                                })];
                        case 1:
                            cliente_1 = _a.sent();
                            menorId = null;
                            if (!(dto.tipoRepresentacao === 'menor' && dto.menor)) return [3 /*break*/, 3];
                            return [4 /*yield*/, this.prisma.menorRepresentado.create({
                                    data: {
                                        clienteId: cliente_1.id,
                                        nome: dto.menor.nome,
                                        dataNascimento: new Date(dto.menor.dataNascimento),
                                        cpf: dto.menor.cpf,
                                        rg: dto.menor.rg,
                                        tipoResponsavel: dto.menor.tipoResponsavel,
                                    },
                                })];
                        case 2:
                            menor = _a.sent();
                            menorId = menor.id;
                            _a.label = 3;
                        case 3: return [4 /*yield*/, this.prisma.processo.create({
                                data: {
                                    clienteId: cliente_1.id,
                                    escritorioId: escritorioId,
                                    numero: "ATD-".concat(Date.now()),
                                    area: dto.area,
                                    tipoAcao: dto.tipoAcao,
                                    valor: dto.valorAcao,
                                    status: 'ATIVO',
                                },
                            })];
                        case 4:
                            processo_1 = _a.sent();
                            // 4. Create initial task
                            return [4 /*yield*/, this.prisma.tarefa.create({
                                    data: {
                                        processoId: processo_1.id,
                                        titulo: 'Aguardando assinatura de documentos',
                                        escritorioId: escritorioId,
                                        status: 'PENDENTE',
                                        prioridade: 'ALTA',
                                    },
                                })];
                        case 5:
                            // 4. Create initial task
                            _a.sent();
                            return [4 /*yield*/, this.prisma.lancamentoFinanceiro.create({
                                    data: {
                                        escritorioId: escritorioId,
                                        clienteId: cliente_1.id,
                                        atendimentoId: null, // Will be updated after atendimento creation
                                        descricao: "Honor\u00E1rios - ".concat(dto.area),
                                        valor: dto.tipoHonorario === 'percentual'
                                            ? dto.valorAcao * (dto.percentualExito / 100)
                                            : dto.valorFixo || 0,
                                        tipo: 'honorario',
                                        status: 'a_efetuar',
                                        formaPagamento: dto.formaPagamento,
                                        numParcelas: dto.numParcelas,
                                        vencimento: dto.vencimento1Parc
                                            ? new Date(dto.vencimento1Parc)
                                            : null,
                                    },
                                })];
                        case 6:
                            lancamento = _a.sent();
                            documentTypes = [
                                'Contrato de Honorários',
                                'Procuração Ad Judicia',
                                'Declaração de Hipossuficiência',
                                'Questionário Jurídico',
                            ];
                            return [4 /*yield*/, Promise.all(documentTypes.map(function (tipo) {
                                    return _this.prisma.documento.create({
                                        data: {
                                            processoId: processo_1.id,
                                            escritorioId: escritorioId,
                                            tipo: tipo,
                                            nome: "".concat(tipo, " - ").concat(cliente_1.nome),
                                            status: 'gerado',
                                            url: null,
                                        },
                                    });
                                }))];
                        case 7:
                            docs = _a.sent();
                            dataLimite = new Date();
                            dataLimite.setDate(dataLimite.getDate() + 7);
                            return [4 /*yield*/, this.prisma.esignEnvelope.create({
                                    data: {
                                        titulo: 'Documentos para Assinatura',
                                        escritorioId: escritorioId,
                                        criadoPorId: escritorioId,
                                        signatario: cliente_1.email,
                                        status: 'enviado',
                                        mensagem: dto.mensagem || 'Segue em anexo os documentos para assinatura',
                                        dataLimite: dataLimite,
                                    },
                                })];
                        case 8:
                            envelope = _a.sent();
                            return [4 /*yield*/, this.prisma.atendimento.create({
                                    data: {
                                        escritorioId: escritorioId,
                                        clienteId: cliente_1.id,
                                        processoId: processo_1.id,
                                        status: 'aguardando_assinatura',
                                        area: dto.area,
                                        tipoAcao: dto.tipoAcao,
                                        valorAcao: dto.valorAcao,
                                        tipoHonorario: dto.tipoHonorario,
                                        valorHonorario: dto.tipoHonorario === 'percentual' ? null : dto.valorFixo,
                                        percentualExito: dto.tipoHonorario === 'percentual' ? dto.percentualExito : null,
                                        formaPagamento: dto.formaPagamento,
                                        parcelamento: dto.parcelamento || false,
                                        numParcelas: dto.numParcelas,
                                        vencimento1Parc: dto.vencimento1Parc
                                            ? new Date(dto.vencimento1Parc)
                                            : null,
                                        envelopeId: envelope.id,
                                        menorId: menorId,
                                        questionario: dto.questionario,
                                    },
                                })];
                        case 9:
                            atendimento = _a.sent();
                            // 9. Update lancamento with atendimentoId
                            return [4 /*yield*/, this.prisma.lancamentoFinanceiro.update({
                                    where: { id: lancamento.id },
                                    data: { atendimentoId: atendimento.id },
                                })];
                        case 10:
                            // 9. Update lancamento with atendimentoId
                            _a.sent();
                            return [2 /*return*/, {
                                    atendimento: atendimento,
                                    cliente: cliente_1,
                                    processo: processo_1,
                                    lancamento: lancamento,
                                    documentos: docs,
                                    envelope: envelope,
                                    message: 'Atendimento criado com sucesso! Aguardando assinatura dos documentos.',
                                }];
                        case 11:
                            error_1 = _a.sent();
                            throw new common_1.BadRequestException("Erro ao criar atendimento: ".concat(error_1.message));
                        case 12: return [2 /*return*/];
                    }
                });
            });
        };
        /**
         * List atendimentos with optional filters
         */
        AtendimentosService_1.prototype.listAtendimentos = function (escritorioId, filters) {
            return __awaiter(this, void 0, void 0, function () {
                var status, area, _a, page, _b, limit, where, skip, _c, atendimentos, total;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            status = filters.status, area = filters.area, _a = filters.page, page = _a === void 0 ? 1 : _a, _b = filters.limit, limit = _b === void 0 ? 20 : _b;
                            where = { escritorioId: escritorioId };
                            if (status)
                                where.status = status;
                            if (area)
                                where.area = area;
                            skip = (page - 1) * limit;
                            return [4 /*yield*/, Promise.all([
                                    this.prisma.atendimento.findMany({
                                        where: where,
                                        skip: skip,
                                        take: limit,
                                        include: {
                                            cliente: true,
                                            processo: true,
                                        },
                                        orderBy: { createdAt: 'desc' },
                                    }),
                                    this.prisma.atendimento.count({ where: where }),
                                ])];
                        case 1:
                            _c = _d.sent(), atendimentos = _c[0], total = _c[1];
                            return [2 /*return*/, {
                                    atendimentos: atendimentos,
                                    pagination: {
                                        page: page,
                                        limit: limit,
                                        total: total,
                                        pages: Math.ceil(total / limit),
                                    },
                                }];
                    }
                });
            });
        };
        /**
         * Get a single atendimento by ID
         */
        AtendimentosService_1.prototype.getAtendimentoById = function (escritorioId, id) {
            return __awaiter(this, void 0, void 0, function () {
                var atendimento;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.prisma.atendimento.findFirst({
                                where: { id: id, escritorioId: escritorioId },
                                include: {
                                    cliente: true,
                                    processo: {
                                        include: {
                                            tarefas: true,
                                            documentos: true,
                                        },
                                    },
                                },
                            })];
                        case 1:
                            atendimento = _a.sent();
                            if (!atendimento) {
                                throw new common_1.NotFoundException("Atendimento ".concat(id, " n\u00E3o encontrado"));
                            }
                            return [2 /*return*/, atendimento];
                    }
                });
            });
        };
        /**
         * Update atendimento status
         */
        AtendimentosService_1.prototype.updateStatus = function (escritorioId, id, status) {
            return __awaiter(this, void 0, void 0, function () {
                var atendimento, validStatuses;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.prisma.atendimento.findFirst({
                                where: { id: id, escritorioId: escritorioId },
                            })];
                        case 1:
                            atendimento = _a.sent();
                            if (!atendimento) {
                                throw new common_1.NotFoundException("Atendimento ".concat(id, " n\u00E3o encontrado"));
                            }
                            validStatuses = [
                                'atendendo',
                                'aguardando_assinatura',
                                'assinado',
                                'iniciando',
                                'ativo',
                                'encerrado',
                            ];
                            if (!validStatuses.includes(status)) {
                                throw new common_1.BadRequestException("Status inv\u00E1lido: ".concat(status));
                            }
                            return [2 /*return*/, this.prisma.atendimento.update({
                                    where: { id: id },
                                    data: { status: status },
                                    include: {
                                        cliente: true,
                                        processo: true,
                                    },
                                })];
                    }
                });
            });
        };
        /**
         * Filter atendimentos by status
         */
        AtendimentosService_1.prototype.filterByStatus = function (escritorioId_1, status_1) {
            return __awaiter(this, arguments, void 0, function (escritorioId, status, page, limit) {
                var skip, _a, atendimentos, total;
                if (page === void 0) { page = 1; }
                if (limit === void 0) { limit = 20; }
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            skip = (page - 1) * limit;
                            return [4 /*yield*/, Promise.all([
                                    this.prisma.atendimento.findMany({
                                        where: { escritorioId: escritorioId, status: status },
                                        skip: skip,
                                        take: limit,
                                        include: {
                                            cliente: true,
                                            processo: true,
                                        },
                                        orderBy: { createdAt: 'desc' },
                                    }),
                                    this.prisma.atendimento.count({
                                        where: { escritorioId: escritorioId, status: status },
                                    }),
                                ])];
                        case 1:
                            _a = _b.sent(), atendimentos = _a[0], total = _a[1];
                            return [2 /*return*/, {
                                    atendimentos: atendimentos,
                                    status: status,
                                    pagination: {
                                        page: page,
                                        limit: limit,
                                        total: total,
                                        pages: Math.ceil(total / limit),
                                    },
                                }];
                    }
                });
            });
        };
        return AtendimentosService_1;
    }());
    __setFunctionName(_classThis, "AtendimentosService");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        AtendimentosService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return AtendimentosService = _classThis;
}();
exports.AtendimentosService = AtendimentosService;
