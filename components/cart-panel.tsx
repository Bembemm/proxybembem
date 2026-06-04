"use client"

import { useState } from "react"
import Image from "next/image"
import { X, Minus, Plus, Trash2, ShoppingBag, User, MapPin, AlertCircle, Lock, Truck } from "lucide-react"
import { useCart } from "@/contexts/cart-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function formatPrice(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  })
}

export function CartPanel() {
  const { items, removeFromCart, updateQuantity, totalPrice, isCartOpen, setIsCartOpen, clearCart } = useCart()
  
  // Dados Pessoais
  const [nome, setNome] = useState("")
  const [cpf, setCpf] = useState("")
  const [telefone, setTelefone] = useState("")
  const [email, setEmail] = useState("")
  
  // Dados de Entrega
  const [cep, setCep] = useState("")
  const [rua, setRua] = useState("")
  const [numero, setNumero] = useState("")
  const [complemento, setComplemento] = useState("")
  const [bairro, setBairro] = useState("")
  const [cidadeUf, setCidadeUf] = useState("")
  const [referencia, setReferencia] = useState("")
  
  // Validação
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [showError, setShowError] = useState(false)

  const formatCpf = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 11)
    return numbers
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
  }

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 11)
    return numbers
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{5})(\d)/, "$1-$2")
  }

  const formatCep = (value: string) => {
    const numbers = value.replace(/\D/g, "").slice(0, 8)
    return numbers.replace(/(\d{5})(\d)/, "$1-$2")
  }

  const validateFields = () => {
    const newErrors: Record<string, boolean> = {}
    
    if (!nome.trim()) newErrors.nome = true
    if (!cpf.trim()) newErrors.cpf = true
    if (!telefone.trim()) newErrors.telefone = true
    if (!email.trim()) newErrors.email = true
    if (!cep.trim()) newErrors.cep = true
    if (!rua.trim()) newErrors.rua = true
    if (!numero.trim()) newErrors.numero = true
    if (!bairro.trim()) newErrors.bairro = true
    if (!cidadeUf.trim()) newErrors.cidadeUf = true
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const clearFieldError = (field: string) => {
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: false }))
    }
    setShowError(false)
  }

  const handleFinishOrder = () => {
    if (items.length === 0) return
    
    if (!validateFields()) {
      setShowError(true)
      return
    }

    const productsList = items
      .map((item) => `- ${item.quantity}x ${item.product.title}`)
      .join("\n")

    const message = `--- NOVO PEDIDO ---

Produtos:
${productsList}

Subtotal (produtos): ${formatPrice(totalPrice)}
Frete: A calcular

Dados do Cliente:
Nome: ${nome}
CPF: ${cpf}
Tel: ${telefone}
Email: ${email}

Endereço de Entrega:
CEP: ${cep}
Rua: ${rua}, ${numero}
Complemento: ${complemento || "Não informado"}
Bairro: ${bairro}
Cidade/UF: ${cidadeUf}
Referência: ${referencia || "Não informado"}
-------------------`

    const encodedMessage = encodeURIComponent(message)
    window.open(`https://wa.me/5544999107516?text=${encodedMessage}`, "_blank")
    
    clearCart()
    setNome("")
    setCpf("")
    setTelefone("")
    setEmail("")
    setCep("")
    setRua("")
    setNumero("")
    setComplemento("")
    setBairro("")
    setCidadeUf("")
    setReferencia("")
    setErrors({})
    setShowError(false)
    setIsCartOpen(false)
  }

  if (!isCartOpen) return null

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
        onClick={() => setIsCartOpen(false)}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-slate-900 border-l border-[#8B5CF6]/30 shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#8B5CF6]/20">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#8B5CF6]" />
            <h2 className="text-lg font-semibold text-white">Meu Carrinho</h2>
          </div>
          <button
            onClick={() => setIsCartOpen(false)}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors focus:outline-none focus:ring-0 focus:ring-offset-0"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <ShoppingBag className="w-16 h-16 text-slate-600 mb-4" />
              <p className="text-slate-400 text-sm">Seu carrinho está vazio</p>
              <p className="text-slate-500 text-xs mt-1">
                Adicione produtos para continuar
              </p>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Cart Items */}
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.product.id}
                    className="flex gap-3 bg-white/5 border border-white/10 rounded-lg p-3"
                  >
                    <div className="relative w-14 h-14 rounded-md overflow-hidden shrink-0">
                      <Image
                        src={item.product.image}
                        alt={item.product.title}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-white line-clamp-1 mb-1">
                        {item.product.title}
                      </h3>
                      <p className="text-[#8B5CF6] font-semibold text-sm">
                        {formatPrice(item.product.discountPrice)}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <button
                          onClick={() =>
                            updateQuantity(item.product.id, item.quantity - 1)
                          }
                          className="p-1 hover:bg-white/10 rounded transition-colors"
                        >
                          <Minus className="w-3 h-3 text-slate-400" />
                        </button>
                        <span className="text-white text-sm w-5 text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() =>
                            updateQuantity(item.product.id, item.quantity + 1)
                          }
                          className="p-1 hover:bg-white/10 rounded transition-colors"
                        >
                          <Plus className="w-3 h-3 text-slate-400" />
                        </button>
                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="p-1 hover:bg-red-500/20 rounded transition-colors ml-auto"
                        >
                          <Trash2 className="w-3 h-3 text-red-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Subtotal */}
              <div className="flex justify-between items-center py-3 border-t border-b border-[#8B5CF6]/20">
                <span className="text-slate-400 font-medium">Subtotal (produtos):</span>
                <span className="text-xl font-bold text-[#8B5CF6]">
                  {formatPrice(totalPrice)}
                </span>
              </div>

              {/* Dados Pessoais */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[#8B5CF6]">
                  <User className="w-4 h-4" />
                  <h3 className="text-sm font-semibold">Dados Pessoais</h3>
                </div>
                
                <div className="grid grid-cols-1 gap-2.5">
                  <div>
                    <Label htmlFor="nome" className="text-slate-400 text-xs">
                      Nome Completo *
                    </Label>
                    <Input
                      id="nome"
                      value={nome}
                      onChange={(e) => {
                        setNome(e.target.value)
                        clearFieldError("nome")
                      }}
                      placeholder="Seu nome completo"
                      className={`mt-1 h-9 text-sm bg-white/5 border-white/20 text-white placeholder:text-slate-500 focus:border-[#8B5CF6] ${errors.nome ? "border-red-400/70 focus:border-red-400" : ""}`}
                    />
                    {errors.nome && (
                      <p className="text-red-400/80 text-[10px] mt-1">Campo obrigatório</p>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="cpf" className="text-slate-400 text-xs">
                        CPF *
                      </Label>
                      <Input
                        id="cpf"
                        value={cpf}
                        onChange={(e) => {
                          setCpf(formatCpf(e.target.value))
                          clearFieldError("cpf")
                        }}
                        placeholder="000.000.000-00"
                        className={`mt-1 h-9 text-sm bg-white/5 border-white/20 text-white placeholder:text-slate-500 focus:border-[#8B5CF6] ${errors.cpf ? "border-red-400/70 focus:border-red-400" : ""}`}
                      />
                      {errors.cpf && (
                        <p className="text-red-400/80 text-[10px] mt-1">Campo obrigatório</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="telefone" className="text-slate-400 text-xs">
                        Telefone (WhatsApp) *
                      </Label>
                      <Input
                        id="telefone"
                        value={telefone}
                        onChange={(e) => {
                          setTelefone(formatPhone(e.target.value))
                          clearFieldError("telefone")
                        }}
                        placeholder="(00) 00000-0000"
                        className={`mt-1 h-9 text-sm bg-white/5 border-white/20 text-white placeholder:text-slate-500 focus:border-[#8B5CF6] ${errors.telefone ? "border-red-400/70 focus:border-red-400" : ""}`}
                      />
                      {errors.telefone && (
                        <p className="text-red-400/80 text-[10px] mt-1">Campo obrigatório</p>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="email" className="text-slate-400 text-xs">
                      E-mail *
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        clearFieldError("email")
                      }}
                      placeholder="seu@email.com"
                      className={`mt-1 h-9 text-sm bg-white/5 border-white/20 text-white placeholder:text-slate-500 focus:border-[#8B5CF6] ${errors.email ? "border-red-400/70 focus:border-red-400" : ""}`}
                    />
                    {errors.email && (
                      <p className="text-red-400/80 text-[10px] mt-1">Campo obrigatório</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Dados de Entrega */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[#8B5CF6]">
                  <MapPin className="w-4 h-4" />
                  <h3 className="text-sm font-semibold">Dados de Entrega</h3>
                </div>
                
                <div className="grid grid-cols-1 gap-2.5">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label htmlFor="cep" className="text-slate-400 text-xs">
                        CEP *
                      </Label>
                      <Input
                        id="cep"
                        value={cep}
                        onChange={(e) => {
                          setCep(formatCep(e.target.value))
                          clearFieldError("cep")
                        }}
                        placeholder="00000-000"
                        className={`mt-1 h-9 text-sm bg-white/5 border-white/20 text-white placeholder:text-slate-500 focus:border-[#8B5CF6] ${errors.cep ? "border-red-400/70 focus:border-red-400" : ""}`}
                      />
                      {errors.cep && (
                        <p className="text-red-400/80 text-[10px] mt-1">Campo obrigatório</p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="rua" className="text-slate-400 text-xs">
                        Rua/Logradouro *
                      </Label>
                      <Input
                        id="rua"
                        value={rua}
                        onChange={(e) => {
                          setRua(e.target.value)
                          clearFieldError("rua")
                        }}
                        placeholder="Nome da rua"
                        className={`mt-1 h-9 text-sm bg-white/5 border-white/20 text-white placeholder:text-slate-500 focus:border-[#8B5CF6] ${errors.rua ? "border-red-400/70 focus:border-red-400" : ""}`}
                      />
                      {errors.rua && (
                        <p className="text-red-400/80 text-[10px] mt-1">Campo obrigatório</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label htmlFor="numero" className="text-slate-400 text-xs">
                        Número *
                      </Label>
                      <Input
                        id="numero"
                        value={numero}
                        onChange={(e) => {
                          setNumero(e.target.value)
                          clearFieldError("numero")
                        }}
                        placeholder="123"
                        className={`mt-1 h-9 text-sm bg-white/5 border-white/20 text-white placeholder:text-slate-500 focus:border-[#8B5CF6] ${errors.numero ? "border-red-400/70 focus:border-red-400" : ""}`}
                      />
                      {errors.numero && (
                        <p className="text-red-400/80 text-[10px] mt-1">Campo obrigatório</p>
                      )}
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="complemento" className="text-slate-400 text-xs">
                        Complemento
                      </Label>
                      <Input
                        id="complemento"
                        value={complemento}
                        onChange={(e) => setComplemento(e.target.value)}
                        placeholder="Apto, Bloco, etc."
                        className="mt-1 h-9 text-sm bg-white/5 border-white/20 text-white placeholder:text-slate-500 focus:border-[#8B5CF6]"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="bairro" className="text-slate-400 text-xs">
                        Bairro *
                      </Label>
                      <Input
                        id="bairro"
                        value={bairro}
                        onChange={(e) => {
                          setBairro(e.target.value)
                          clearFieldError("bairro")
                        }}
                        placeholder="Bairro"
                        className={`mt-1 h-9 text-sm bg-white/5 border-white/20 text-white placeholder:text-slate-500 focus:border-[#8B5CF6] ${errors.bairro ? "border-red-400/70 focus:border-red-400" : ""}`}
                      />
                      {errors.bairro && (
                        <p className="text-red-400/80 text-[10px] mt-1">Campo obrigatório</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="cidadeUf" className="text-slate-400 text-xs">
                        Cidade / UF *
                      </Label>
                      <Input
                        id="cidadeUf"
                        value={cidadeUf}
                        onChange={(e) => {
                          setCidadeUf(e.target.value)
                          clearFieldError("cidadeUf")
                        }}
                        placeholder="Cidade - UF"
                        className={`mt-1 h-9 text-sm bg-white/5 border-white/20 text-white placeholder:text-slate-500 focus:border-[#8B5CF6] ${errors.cidadeUf ? "border-red-400/70 focus:border-red-400" : ""}`}
                      />
                      {errors.cidadeUf && (
                        <p className="text-red-400/80 text-[10px] mt-1">Campo obrigatório</p>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="referencia" className="text-slate-400 text-xs">
                      Ponto de Referência
                    </Label>
                    <Input
                      id="referencia"
                      value={referencia}
                      onChange={(e) => setReferencia(e.target.value)}
                      placeholder="Próximo a..."
                      className="mt-1 h-9 text-sm bg-white/5 border-white/20 text-white placeholder:text-slate-500 focus:border-[#8B5CF6]"
                    />
                  </div>
                </div>
              </div>

              {/* Checkout Button */}
              <div className="pt-2 pb-4">
                {/* Aviso de Frete */}
                <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3 mb-4">
                  <div className="flex items-start gap-2.5">
                    <Truck className="w-5 h-5 text-[#8B5CF6] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-white text-sm font-semibold mb-1">Calculo de Frete</p>
                      <p className="text-gray-400 text-xs leading-relaxed">
                        Para garantir o envio mais barato para a sua regiao, calcularemos o frete diretamente no WhatsApp antes do pagamento.
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={handleFinishOrder}
                  className="w-full bg-[#8B5CF6] hover:bg-[#7C3AED] text-white py-3 text-sm font-semibold"
                >
                  Finalizar Compra via WhatsApp
                </Button>
                {showError && Object.keys(errors).some(key => errors[key]) && (
                  <div className="flex items-center justify-center gap-1.5 mt-2 text-red-400/80">
                    <AlertCircle className="w-3 h-3" />
                    <p className="text-xs">Preencha todos os campos obrigatórios</p>
                  </div>
                )}
                <p className="text-slate-500 text-xs text-center mt-2">
                  * Campos obrigatórios
                </p>
                <div className="flex items-center justify-center gap-1.5 mt-3 mb-2">
                  <Lock className="w-3 h-3 text-[#8B5CF6]/60" />
                  <p className="text-slate-500/80 text-[10px]">
                    Pagamento 100% Seguro via Pix. Seus dados estão protegidos.
                  </p>
                </div>
                <p className="text-slate-500 text-[10px] text-center leading-relaxed px-2">
                  Seus dados são usados apenas para o processamento do seu pedido e não são armazenados. Após o envio via WhatsApp, nossa equipe entrará em contato para confirmar o pagamento via Pix e o envio do seu rastreio.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
